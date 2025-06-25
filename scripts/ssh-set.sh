#!/bin/bash

# Ensure ~/.ssh exists
mkdir -p ~/.ssh

# Copy the key file to ~/.ssh
cp a1001.pem ~/.ssh/a1001.pem

# Set correct permissions on the key
chmod 600 ~/.ssh/a1001.pem

# Write SSH config entries
cat > ~/.ssh/config <<EOF
Host h0
    HostName hpcdev000000
    User hpcuser
    IdentityFile ~/.ssh/a1001.pem

Host h1
    HostName hpcdev000001
    User hpcuser
    IdentityFile ~/.ssh/a1001.pem

Host h2
    HostName hpcdev000002
    User hpcuser
    IdentityFile ~/.ssh/a1001.pem

Host h3
    HostName hpcdev000003
    User hpcuser
    IdentityFile ~/.ssh/a1001.pem
EOF

# Set correct permissions on the config file
chmod 600 ~/.ssh/config

echo "SSH configuration set up successfully."
