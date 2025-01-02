#include "audioprocessing.h"
#include <cmath>
#include <algorithm>


AGC::AGC(float desiredLevel, float attackTimeMs, float releaseTimeMs, float lookAheadTimeMs, float sr)
    : desired_level(desiredLevel), sample_rate(sr) {
    look_ahead_samples = static_cast<size_t>(lookAheadTimeMs * sample_rate / 1000.0f);
    attack_coeff = 1 - exp(-1.0f / (attackTimeMs * 0.001f * sample_rate));
    release_coeff = 1 - exp(-1.0f / (releaseTimeMs * 0.001f * sample_rate));
    
    // Initialize multiple gain stages (RF, IF1, IF2, IF3, Audio)
    gains.resize(5, 1.0f);

    max_gain = 1000.0f; // was 500.0f Bas ON5HB
    
    // Hang system
    hang_time = static_cast<size_t>(0.05f * sample_rate); // Was 500ms hang time, changed to 50ms, Bas ON5HB
    hang_threshold = 0.05f; // was 0.5f just as above
    
    // Dual time constant
    fast_attack_coeff = 1 - exp(-1.0f / (0.5f * 0.001f * sample_rate)); // 5ms fast attack, made 0.5ms attack Bas ON5HB
    
    // AM time constants
    am_attack_coeff = attack_coeff * 0.1f;
    am_release_coeff = release_coeff * 0.1f;


    // Initialize Noise Blanker parameters
    nb_enabled = false;
    nb_fft_size = 512;
    nb_overlap = 256;
    nb_average_windows = 32;
    nb_threshold = 95.f;
    
    nb_buffer.resize(nb_fft_size);
    nb_spectrum_history.resize(nb_average_windows, std::vector<float>(nb_fft_size / 2));
    nb_spectrum_average.resize(nb_fft_size / 2);
    nb_history_index = 0;

    nb_fft_in = fftwf_alloc_complex(nb_fft_size);
    nb_fft_out = fftwf_alloc_complex(nb_fft_size);
    nb_fft_plan = fftwf_plan_dft_1d(nb_fft_size, nb_fft_in, nb_fft_out, FFTW_FORWARD, FFTW_ESTIMATE);
    nb_ifft_plan = fftwf_plan_dft_1d(nb_fft_size, nb_fft_out, nb_fft_in, FFTW_BACKWARD, FFTW_ESTIMATE);
    
    reset();
}

void AGC::push(float sample) {
    lookahead_buffer.push_back(sample);
    while (!lookahead_max.empty() && std::abs(lookahead_max.back()) < std::abs(sample)) {
        lookahead_max.pop_back();
    }
    lookahead_max.push_back(sample);

    if (lookahead_buffer.size() > look_ahead_samples) {
        pop();
    }
}

void AGC::pop() {
    float sample = lookahead_buffer.front();
    lookahead_buffer.pop_front();
    if (!lookahead_max.empty() && sample == lookahead_max.front()) {
        lookahead_max.pop_front();
    }
}

float AGC::max() {
    return lookahead_max.empty() ? 0.0f : std::abs(lookahead_max.front());
}

void AGC::applyNoiseBlanker(std::vector<float>& buffer) {
    std::vector<float> processed_buffer(buffer.size());

    for (size_t i = 0; i < buffer.size(); i += nb_overlap) {
        // Fill the buffer
        size_t copy_size = std::min(nb_fft_size, buffer.size() - i);
        std::copy(buffer.begin() + i, buffer.begin() + i + copy_size, nb_buffer.begin());

        // Perform FFT
        for (size_t j = 0; j < nb_fft_size; ++j) {
            nb_fft_in[j][0] = nb_buffer[j];
            nb_fft_in[j][1] = 0;
        }
        fftwf_execute(nb_fft_plan);

        // Calculate magnitude spectrum
        std::vector<float> magnitude_spectrum(nb_fft_size / 2);
        for (size_t j = 0; j < nb_fft_size / 2; ++j) {
            magnitude_spectrum[j] = std::sqrt(nb_fft_out[j][0] * nb_fft_out[j][0] + nb_fft_out[j][1] * nb_fft_out[j][1]);
        }

        // Update average spectrum
        nb_spectrum_history[nb_history_index] = magnitude_spectrum;
        nb_history_index = (nb_history_index + 1) % nb_average_windows;

        for (size_t j = 0; j < nb_fft_size / 2; ++j) {
            nb_spectrum_average[j] = std::accumulate(nb_spectrum_history.begin(), nb_spectrum_history.end(), 0.0f,
                [j](float sum, const std::vector<float>& spectrum) { return sum + spectrum[j]; }) / nb_average_windows;
        }

        // Calculate average signal level
        float avg_signal_level = std::accumulate(nb_spectrum_average.begin(), nb_spectrum_average.end(), 0.0f) / nb_spectrum_average.size();

        // Dynamic threshold based on average signal level
        float dynamic_threshold = nb_threshold * avg_signal_level;

        // Scale current spectrum
        for (size_t j = 0; j < nb_fft_size / 2; ++j) {
            float ratio = magnitude_spectrum[j] / nb_spectrum_average[j];
            float scale = ratio > 1 ? 1 / std::pow(ratio, 0.5f) : 1; // More gradual scaling
            nb_fft_out[j][0] *= scale;
            nb_fft_out[j][1] *= scale;
        }

        // Inverse FFT
        fftwf_execute(nb_ifft_plan);

        // Apply noise reduction
        for (size_t j = 0; j < nb_fft_size && (i + j) < buffer.size(); ++j) {
            float magnitude = std::sqrt(nb_fft_in[j][0] * nb_fft_in[j][0] + nb_fft_in[j][1] * nb_fft_in[j][1]);

            if (magnitude > dynamic_threshold) {
                float reduction_factor = dynamic_threshold / magnitude;
                processed_buffer[i + j] = buffer[i + j] * reduction_factor;
            } else {
                processed_buffer[i + j] = buffer[i + j];
            }
        }
    }

    // Copy the processed buffer back to the input buffer
    buffer = processed_buffer;
}


void AGC::process(float *arr, size_t len) {
    std::vector<float> buffer(arr, arr + len);

    // Apply Noise Blanker if enabled
    if(nb_enabled) {
        applyNoiseBlanker(buffer);
    }
    


    for (size_t i = 0; i < len; i++) {
        push(buffer[i]);

        if (lookahead_buffer.size() == look_ahead_samples) {
            float current_sample = lookahead_buffer.front();
            float peak_sample = max();

            float desired_gain = std::min(desired_level / (peak_sample + 1e-15f), max_gain);

            applyProgressiveAGC(desired_gain);

            // Apply the combined gain to the current sample
            float total_gain = 1.0f;
            for (float g : gains) total_gain *= g;
            total_gain = std::min(total_gain, max_gain);  // Apply maximum gain limit
            arr[i] = current_sample * (total_gain * 0.01f);
        } else {
            arr[i] = 0.0f;
        }
    }
}

void AGC::applyProgressiveAGC(float desired_gain) {
    // Apply AGC progressively to different stages
    for (size_t i = 0; i < gains.size(); ++i) {
        float stage_desired_gain = std::min(std::pow(desired_gain, 1.0f / gains.size()), max_gain);
        
        // Implement hang system
        if (stage_desired_gain < gains[i] * hang_threshold) {
            hang_counter = hang_time;
        }
        
        if (hang_counter > 0) {
            hang_counter--;
        } else {
            // Dual time constant system
            float fast_gain = gains[i] * (1 - fast_attack_coeff) + stage_desired_gain * fast_attack_coeff;
            float slow_gain;
            
            // Use AM time constants for slower AGC
            if (stage_desired_gain < gains[i]) {
                slow_gain = gains[i] * (1 - am_attack_coeff) + stage_desired_gain * am_attack_coeff;
            } else {
                slow_gain = gains[i] * (1 - am_release_coeff) + stage_desired_gain * am_release_coeff;
            }
            
            gains[i] = std::min(fast_gain, slow_gain);
        }
    }
    
    // Delayed AGC for RF stage (first stage)
    if (desired_gain > gains[0]) {
        gains[0] = std::min(gains[0] * (1 - release_coeff * 0.1f) + desired_gain * release_coeff * 0.1f, max_gain);
    }
}

void AGC::reset() {
    std::fill(gains.begin(), gains.end(), 1.0f);
    lookahead_buffer.clear();
    lookahead_max.clear();
    hang_counter = 0;

}
