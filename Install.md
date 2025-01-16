# PhantomSDR+ (Community Version)

## Installation

Install the OS and dependancies.

We recommend you use Ubuntu 22 Server (Jammy) and after install running all available updates for this version of Ubuntu.

Next item is to get OpenCL support installed. This will take some research on your part. You must first find out how your system will
support OpenCL (either by CPU or GPU). We leave this up to you to find out and get working. We have a forum for questions so use Google
the forum to get this squared away before moving forward.

# Building
```
apt install build-essential cmake pkg-config meson libfftw3-dev libwebsocketpp-dev libflac++-dev zlib1g-dev libzstd-dev libboost-all-dev libopus-dev libliquid-dev git psmisc
```

## Pick a folder to install to, we suggest /opt because of other scripts that are posted in the forums.

### Building the binary automatically
Pick a folder to install to, we suggest /opt because of other scripts that are posted in the forums.

```
git clone https://github.com/ny4qphil/PhantomSDR-Plus.git
cd PhantomSDR-Plus
chmod +x *.sh
sudo ./install.sh
```
Restart your Terminal after you ran install.sh otherwise it wont work..

# Entering your site information
There is a file in the frontend folder entitled 'site_information_template.json' This will need to be modified before you compile the frontend.

First copy the template to the file name we use which is site_information.json
```
cp site_information_template.json site_information.json
```
Edit the file and edit the information to match your WebSDR you will publish. Make sure you have the following correct :
```
siteSDRBaseFrequency = the baseband_frequency in your TOML file.
siteSDRBandwidth = the bandspread you want to publish
siteITURegion = your ITU region
```
For example, for my LCS site, I want to publish 0-30MHz and I am in ITU region 2, so my settings are :
```
"siteSDRBaseFrequency": = 0,
"siteSDRBandwidth": = 30000000,
"siteSDRRegion": 2,
```
These settings are very important because the GUI bands and waterfall settings are created using these variables.

Once, these are correct, you can move on to compiling the frontend (GUI).

### Compiling the Frontend, you need to follow the information here
```
https://linuxize.com/post/how-to-install-node-js-on-ubuntu-20-04/#installing-nodejs-and-npm-using-nvm
```
Else 'npm audit fix' and 'npm run build' will not function as should.

To build the frontend, simply change to the frontend directory and enter the following commands :
```
npm install
npm audit fix
npm run build
```

If all goes well, you are ready to start your receiver and websdr instances and publish your Phantom+ WebSDR.

If you have trouble, hit the forum and we will help all we can

https://www.phantomsdr.fun/

73,
The PhantomSDR+ Community

