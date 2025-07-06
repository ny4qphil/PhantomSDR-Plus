#!/bin/bash
cd /opt/PhantomSDR-Plus/

### STOP CRASH Injections!!!!
##If no other rules apply, flushing is easier

iptables -D INPUT -m string --algo kmp --string "%3C%" -j DROP
iptables -D INPUT -m string --algo kmp --string "device.rsp" -j DROP

iptables -A INPUT -m string --algo kmp --string "%3C%" -j DROP
iptables -A INPUT -m string --algo kmp --string "device.rsp" -j DROP

## Files to load 
FIFO=fifo.fifo
TOML=config-rx888mk2.toml

[ ! -e "$FIFO" ] && mkfifo $FIFO

service receiver restart

sleep 2

build/spectrumserver --config $TOML < $FIFO

#exit


