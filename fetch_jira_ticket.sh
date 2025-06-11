#!/bin/bash

# Usage: ./fetch_jira_ticket.sh APP-2345
source ~/bin/.jiraconfig

set -e

TICKET_ID="$1"

if [ -z "$TICKET_ID" ]; then
  echo "Usage: $0 <TICKET_ID>"
  exit 1
fi

if [ -z "$JIRA_BASE_URL" ] || [ -z "$JIRA_EMAIL" ] || [ -z "$JIRA_API_TOKEN" ]; then
  echo "Missing environment variables: JIRA_BASE_URL, JIRA_EMAIL, or JIRA_API_TOKEN"
  exit 1
fi

AUTH_HEADER=$(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)

ISSUE_RESPONSE=$(curl -s -H "Authorization: Basic $AUTH_HEADER" \
                      -H "Accept: application/json" \
                      "$JIRA_BASE_URL/rest/api/3/issue/$TICKET_ID?expand=renderedFields")

COMMENTS_RESPONSE=$(curl -s -H "Authorization: Basic $AUTH_HEADER" \
                         -H "Accept: application/json" \
                         "$JIRA_BASE_URL/rest/api/3/issue/$TICKET_ID/comment")

# Combine both JSONs and extract fields into a new JSON
echo "$ISSUE_RESPONSE" | jq --argjson comments "$COMMENTS_RESPONSE" '
{
  ticket: .key,
  title: .fields.summary,
  description: (try .fields.description.content catch "No description"),
  comments: ($comments.comments | map({
    author: .author.displayName,
    body: (try .body.content[0].content[0].text catch "No text"),
    created: .created
  }))
}
'
# > "/tmp/${TICKET_ID}.json"
#echo "Saved ticket data to /tmp/${TICKET_ID}.json"

