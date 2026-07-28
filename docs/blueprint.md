# GroupGuard Moderation Bot — Bot specification

**Archetype:** community

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

Automated anti-spam and moderation bot for Telegram groups with human verification, spam detection, admin commands, and action logging. Enforces rules through configurable thresholds and provides moderation analytics to admins.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram group owners
- Community moderators
- Private group admins

## Success criteria

- Reduces spam posts by 90% through automated verification and heuristics
- Maintains group health with configurable moderation thresholds
- Provides actionable moderation logs and analytics to admins

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open moderation bot main menu
- **/warn** (command, actor: admin, command: /warn) — Warn a user with reason
  - inputs: @username, reason
  - outputs: Warning message
- **/mute** (command, actor: admin, command: /mute) — Mute user for duration
  - inputs: @username, duration
  - outputs: Mute confirmation
- **/kick** (command, actor: admin, command: /kick) — Kick user with reason
  - inputs: @username, reason
  - outputs: Kick confirmation
- **I'm human** (command, actor: user, callback: verify:confirm) — Verification button for new members

## Flows

### New member verification
_Trigger:_ User joins group

1. Post welcome message with verification button
2. Restrict sending rights until verification
3. Remove user if unverified after timeout

_Data touched:_ Member, Verification session

### Spam detection
_Trigger:_ Message posted

1. Check link age and account age
2. Detect duplicate messages
3. Evaluate message rate
4. Apply moderation actions

_Data touched:_ Incident, Member

### Admin action log
_Trigger:_ Moderation action taken

1. Record action details
2. Notify admin chat
3. Update user permissions

_Data touched:_ Admin action record, Member

### Moderation summary
_Trigger:_ Daily/weekly interval

1. Aggregate join/verification stats
2. Format summary report
3. Post to admin chat

_Data touched:_ Incident, Member

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Member** _(retention: persistent)_ — Tracks user verification status and permissions
  - fields: user_id, join_time, verified, trusted
- **Verification session** _(retention: session)_ — Timed verification state for new members
  - fields: user_id, timeout, status
- **Incident** _(retention: persistent)_ — Record of automated moderation actions
  - fields: timestamp, action_type, evidence, user_id
- **Admin action record** _(retention: persistent)_ — Manual moderation actions by admins
  - fields: timestamp, action_type, reason, admin_id, user_id

## Integrations

- **Telegram** (required) — Bot API messaging and group moderation
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure verification timeout (default 5min)
- Set link suspicion thresholds (default 48h account age)
- Adjust spam detection sensitivity
- Customize welcome message and rules text
- Select moderation escalation levels

## Notifications

- Automated removal notifications
- Daily moderation summary reports
- Spam incident alerts
- Verification timeout warnings

## Permissions & privacy

- Admins can only moderate non-admin users
- Pinned messages are never moderated
- No personal data stored beyond moderation needs
- Verification status is anonymous to other users

## Edge cases

- Users who never verify after timeout
- Mass spam campaigns with coordinated timing
- Admins accidentally triggering moderation actions on themselves
- Multiple simultaneous spam events from single user

## Required tests

- End-to-end verification flow with timeout handling
- Spam detection accuracy with edge cases
- Admin command permissions enforcement
- Log retention and rotation behavior

## Assumptions

- Groups use public links with moderate traffic
- Admins will review automated actions periodically
- Moderation thresholds will be tuned to group needs
