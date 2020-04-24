#!/bin/bash

set -e

readonly http_port=8080
readonly chrome_port=9222
readonly window_size=640,480
readonly time_budget=100000

readonly test_urls=( \
  http://localhost:$http_port/nammd/test/slide.md \
  https://raw.githubusercontent.com/araij/nammd/master/docs/test/slide.html \
  https://github.com/araij/nammd/raw/master/docs/test/slide.md \
  https://github.com/araij/nammd/blob/master/docs/test/slide.md \
)

assert_same_hash() {
  echo -n "assert_same_hash '$1' '$2' ... "
  local -r h1=($(sha1sum $1))
  local -r h2=($(sha1sum $2))
  if [[ "$h1" == "$h2" ]]; then
    echo "OK."
    return 0
  else
    echo "Failed."
    return 1
  fi
}

capture() {
  google-chrome \
    --headless \
    --disable-gpu \
    --screenshot="$2" \
    --window-size=$window_size \
    --virtual-time-budget=$time_budget \
    http://localhost:$http_port/nammd/master/?url=$1
}

# unset $DISPLAY to prevent Chrome from connecting to the X server
export DISPLAY=''

# Make a temporary public_html directory
readonly html_dir=$(mktemp -d)

# Cleanup the temporary directory at the exit
trap "rm -rf $html_dir" EXIT

# Cleanup a HTTP server started as a background job at the exit
trap "exit" INT TERM
trap "kill 0" EXIT

# Imitate GitHub Pages directories and start a HTTP server
ln -s $(pwd)/../docs $html_dir/nammd
(cd $html_dir; python3 -m http.server $http_port) &
sleep 1

if [[ "$1" == '--update' ]]; then
  capture ${test_urls[0]} reference.png
else
  for u in ${test_urls[@]}; do
    echo "Testing $u"
    capture $u testee.png
    assert_same_hash reference.png testee.png
  done
fi
