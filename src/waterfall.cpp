#include <cmath>

#include "waterfall.h"
#include "waterfallcompression.h"
#include <atomic>
#include <chrono>
#include <thread>
#include <iostream>

std::atomic<bool> monitor_thread_running{false};
std::atomic<size_t> total_bits_sent{0}; // Atomic to safely increment from multiple clients
double waterfall_kbits_per_second = 0;

void monitor_data_rate() {
    monitor_thread_running = true;
    while (monitor_thread_running) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        size_t bits = total_bits_sent.exchange(0); // Reset counter and get value atomically
        waterfall_kbits_per_second = bits / 1000.0;
        //std::cout << "Data rate: " << kbits_per_second << " kbit/s" << std::endl;
    }
}

void ensure_monitor_thread_runs() {
    if (!monitor_thread_running) {
        std::thread(monitor_data_rate).detach();
    }
}

WaterfallClient::WaterfallClient(
    connection_hdl hdl, PacketSender &sender,
    waterfall_compressor waterfall_compression, int min_waterfall_fft)
    : Client(hdl, sender, WATERFALL), min_waterfall_fft{min_waterfall_fft},
      level{0}, waterfall_slices{sender.get_waterfall_slices()},
      waterfall_slice_mtx{sender.get_waterfall_slice_mtx()} {

    if (waterfall_compression == WATERFALL_ZSTD) {
        waterfall_encoder =
            std::make_unique<ZstdEncoder>(hdl, sender, min_waterfall_fft);
    }
#ifdef HAS_LIBAOM
    else if (waterfall_compression == WATERFALL_AV1) {
        waterfall_encoder =
            std::make_unique<AV1Encoder>(hdl, sender, min_waterfall_fft);
    }
#endif
}

void WaterfallClient::set_waterfall_range(int level, int l, int r) {

    // Change the waterfall data structures to reflect the changes
    auto node = ([&] {
        std::scoped_lock lk(waterfall_slice_mtx[this->level]);
        return waterfall_slices[this->level].extract(it);
    })();

    {
        std::scoped_lock lk(waterfall_slice_mtx[level]);
        node.key() = {l, r};
        it = waterfall_slices[level].insert(std::move(node));
    }

    this->l = l;
    this->r = r;
    this->level = level;
}

void WaterfallClient::send_waterfall(int8_t *buf, size_t frame_num) {
    try {
        int len = r - l;
        // Assuming each element in buf is 1 byte, convert length to bits
        size_t bits_sent = static_cast<size_t>(len) * 8;
        
        waterfall_encoder->send(buf, len, frame_num, l << level, r << level);

        // Ensure monitoring thread is running
        ensure_monitor_thread_runs();

        // Add to the total bits sent
        total_bits_sent.fetch_add(bits_sent, std::memory_order_relaxed);
    } catch (...) {
        // Handle error (client disconnect, etc.)
    }
}

void WaterfallClient::on_window_message(int new_l, std::optional<double> &,
                                        int new_r, std::optional<int> &) {
    // Sanitize the inputs
    if (new_l < 0 || new_r < 0 || new_l >= new_r) {
        return;
    }
    // Calculate which level should it be at
    // Each level decreases the amount of points available by 2
    // Use floating point to prevent integer rounding errors
    // Find level closest to min_waterfall_fft samples

    float new_l_f = new_l;
    float new_r_f = new_r;
    int downsample_levels = waterfall_slices.size();
    int new_level = downsample_levels - 1;
    float best_difference = min_waterfall_fft * 2;
    for (int i = 0; i < downsample_levels; i++) {
        float send_size = abs((new_r_f - new_l_f) - min_waterfall_fft);
        if (send_size < best_difference) {
            best_difference = send_size;
            new_level = i;
            new_l = round(new_l_f);
            new_r = round(new_r_f);
        }
        new_l_f /= 2;
        new_r_f /= 2;
    }

    // Since the parameters are modified, output the new parameters


    set_waterfall_range(new_level, new_l, new_r);
}

void WaterfallClient::on_close() {
    std::scoped_lock lk(waterfall_slice_mtx[level]);
    waterfall_slices[level].erase(it);
}