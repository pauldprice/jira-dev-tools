#!/bin/bash

echo "Testing promptly edit functionality..."
echo ""

# First, create a test prompt if it doesn't exist
./toolbox promptly save test-edit --from-string "This is a test prompt with \${placeholder:default}" --category test --description "Test prompt for editing" --force

echo ""
echo "Original prompt:"
./toolbox promptly show test-edit

echo ""
echo "---"
echo ""
echo "Now let's edit it..."
echo "You can use: ./toolbox promptly edit test-edit"
echo "Or use the wizard: ./toolbox wizard"