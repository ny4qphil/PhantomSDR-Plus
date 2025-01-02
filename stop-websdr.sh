#!/bin/bash

killall -s 9 spectrumserver
killall -s 9 rx_sdr
killall -s 9 rx888_stream
killall -s 9 rtl_sdr

service sdrplay stop

sleep 2

exit


