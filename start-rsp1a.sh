#!/bin/bash

killall -s 9 spectrumserver
killall -s 9 rx_sdr

service sdrplay restart

sleep 2

rx_sdr -f 4000000 -s 8000000 -d driver=sdrplay -g RFGR=1 -t rfnotch_ctrl=false -F CS16 - | ./build/spectrumserver --config config-rsp1a.toml > /dev/null 2>&1 &

exit


