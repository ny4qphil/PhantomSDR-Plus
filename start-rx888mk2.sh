#!/bin/bash
cd /opt/PhantomSDR-Plus/

killall -s 9 spectrumserver
killall -s 9 rx888_stream

# Turn USB powersaving off
echo on | sudo tee /sys/bus/usb/devices/*/power/control > /dev/null

RUST_BACKTRACE=1

./rx888_stream/target/release/rx888_stream -f ./rx888_stream/SDDC_FX3.img -s 60000000 -g 30 -m low -o - > fifo.fifo &

./build/spectrumserver --config config-rx888mk2.toml < fifo.fifo &

exit


