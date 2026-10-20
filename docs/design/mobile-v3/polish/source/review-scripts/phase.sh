#!/bin/bash
# make throwaway copies of an artboard with a forced prop value for local review
cd /tmp/claude-0/-home-user-sift-sports-intelligence/b7bf3b8b-424e-5162-b9a0-4c6353eb215d/scratchpad/dc/project
sed "s/this.props.phase/'pregame'/g" Game.dc.html > _Game_pre.dc.html
sed "s/this.props.phase/'final'/g" Game.dc.html > _Game_fin.dc.html
sed "s/this.props.feed/'published'/g" Main.dc.html > _Main_pub.dc.html
