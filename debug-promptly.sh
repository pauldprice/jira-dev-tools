#!/bin/bash

echo "Debugging promptly formatReleaseNotes prompt..."
echo ""

# Show the saved prompt details
./toolbox promptly show formatReleaseNotes

echo ""
echo "---"
echo ""

# Try a dry run to see the final prompt
echo "Dry run to see final prompt:"
./toolbox promptly run formatReleaseNotes --dry-run