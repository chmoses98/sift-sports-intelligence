#!/bin/bash
# WebKitGTK driver under Xvfb, with the session proxy so the browser can reach the published data
export https_proxy="$HTTPS_PROXY" HTTPS_PROXY="$HTTPS_PROXY" SSL_CERT_FILE=/root/.ccr/ca-bundle.crt
exec xvfb-run -a -s "-screen 0 1280x1600x24" WebKitWebDriver --port=4444 > ${TMPDIR:-/tmp}/wkdriver.log 2>&1
