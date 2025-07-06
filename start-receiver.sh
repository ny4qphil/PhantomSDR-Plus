#!/bin/bash
cd /opt/PhantomSDR-Plus/

## Files to load 
FIFO=fifo.fifo
TOML=config-rx888mk2.toml

[ ! -e "$FIFO" ] && mkfifo $FIFO

#Without PGA
rx888_stream/target/release/rx888_stream -f ./rx888_stream/SDDC_FX3.img -s 60000000 --pga -d -r -g 80 -a 0 -m low -o - > $FIFO 

#exit
