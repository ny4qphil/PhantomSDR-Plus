#!/bin/bash

killall -s 9 spectrumserver
killall -s 9 rtl_sdr

rtl_sdr -g 48 -f 145000000 -s 2048000 - | ./build/spectrumserver --config config-rtl.toml > /dev/null 2>&1 &

exit


