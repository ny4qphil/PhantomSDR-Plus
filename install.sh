#!/bin/bash

# Check if sudo is available and set the command prefix accordingly
if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
else
    SUDO=""
fi



# Update and install necessary packages
echo "Updating package lists and installing necessary packages..."
$SUDO apt-get update
$SUDO apt-get install -y build-essential cmake pkg-config meson libfftw3-dev libwebsocketpp-dev libflac++-dev zlib1g-dev libzstd-dev libboost-all-dev libopus-dev libliquid-dev git libcurlpp-dev curl cargo nlohmann-json3-dev

# Check if the previous command was successful
if [ $? -eq 0 ]; then
    echo "Packages installed successfully."
    # Build the main application with Meson
    echo "Building the main application..."
    meson build --optimization=3
    # Use just 2 cores to compile with -J2 else tiny systems like an RPi4 with 2GB won't finish compiling.
    meson compile -j2 -C build
    if [ $? -ne 0 ]; then
        echo "Failed to build the main application. Please check for errors and try again."
        exit 1
    fi
    echo "Welcome to PhantomPlus Installer!"
    echo "Which SDR would you like to set up?"
    echo "  [1] RX888 MKII / RX888"
    echo "  [2] RTLSDR"
    echo "  [3] SDRPlay"
    echo "  [4] Do not install SDR driver, skip to websdr install only"
    read -p "Select an option [1-3]: " option

    case $option in
        1) echo "Setting up RX888 MKII / RX888..."
            $SUDO apt-get autoremove -y rustc
            echo "Installing Rust..."
            curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
            source "$HOME/.cargo/env"
            
            # Clone the rx888_stream repository
            echo "Cloning the rx888_stream repository..."
            git clone https://github.com/rhgndf/rx888_stream
            cd rx888_stream
            
            # Build and install
            echo "Building and installing..."
            RUSTFLAGS="-C target-cpu=native" cargo build --release
            RUSTFLAGS="-C target-cpu=native" cargo install --path .
            
            echo "RX888 is successfully set up. Please restart your Terminal and then run the start command."
            ;;
        2) echo "Setting up RTLSDR..."
            read -p "Do you have a RTL-SDR V4? (y/n): " rtlsdr_v4
            if [[ $rtlsdr_v4 == "y" || $rtlsdr_v4 == "Y" ]]; then
                echo "Setting up RTL-SDR V4..."
                $SUDO apt purge ^librtlsdr -y
                $SUDO rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*
                $SUDO apt-get install libusb-1.0-0-dev git cmake pkg-config -y
                git clone https://github.com/rtlsdrblog/rtl-sdr-blog
                cd rtl-sdr-blog
                mkdir build
                cd build
                cmake ../ -DINSTALL_UDEV_RULES=ON
                make
                $SUDO make install
                $SUDO cp ../rtl-sdr.rules /etc/udev/rules.d/
                $SUDO ldconfig
                echo 'blacklist dvb_usb_rtl28xxu' | $SUDO tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
                echo "Please reboot your system for the changes to take effect. After rebooting, your RTL-SDR V4 setup will be complete."
            else
                echo "Setting up a non V4 RTLSDR..."
                $SUDO apt-get install libusb-1.0-0-dev git cmake pkg-config librtlsdr0 librtlsdr-dev rtlsdr -y
                echo "RTLSDR setup is complete."
            fi
            ;;
        3) echo "Setting up SDRPlay..."
            git clone https://github.com/ericek111/libmirisdr-5 || { echo "Failed to clone libmirisdr-5 repository."; exit 1; }
            cd libmirisdr-5 || { echo "Failed to enter the libmirisdr-5 directory."; exit 1; }
            
            cmake . || { echo "CMake configuration failed."; exit 1; }
            make || { echo "Make failed."; exit 1; }
            $SUDO make install || { echo "Make install failed."; exit 1; }
            $SUDO rm -rf libmirisdr-5
            
            echo "SDRPlay setup is complete."
            ;;
        *) echo "Invalid option selected. Exiting."
            exit 1
            ;;
    esac
else
    echo "An error occurred during package installation. Please check your installation and try again."
    exit 1
fi
