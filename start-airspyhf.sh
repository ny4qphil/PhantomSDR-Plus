#!/bin/bash

killall -s 9 spectrumserver
killall -s 9 rx_sdr

sleep 2

rx_sdr -f 456000 -s 912000 -d driver=airspyhf -F CS16 - | ./build/spectrumserver --config config-airspyhf.toml > /dev/null 2>&1 &

exit


