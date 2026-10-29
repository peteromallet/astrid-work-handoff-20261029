#!/bin/sh
# Astrid's Mac and Linux installer lives at /install; this name is kept for people who guess it.
curl -fsSL https://astrid.haus/install | sh -s -- "$@"
