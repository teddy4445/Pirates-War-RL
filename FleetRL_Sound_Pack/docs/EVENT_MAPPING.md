# Event-to-sound mapping

These are semantic adapter suggestions, not declarations of the existing engine event names. Map them to the actual repository schema.

| Event meaning | Sound or variant group | Conditions |
|---|---|---|
| Cannon fired | cannon_fire | Visible/permitted firing event; once, not per projectile frame. |
| Cannon becomes ready | cannon_reload | Optional; selected friendly ship only. |
| Cannonball passes viewer | cannon_pass | Optional visual near-miss; do not reveal hidden projectiles. |
| Cannonball hits hull | hull_hit | Visible/permitted impact; not merely hit-test proximity. |
| Cannonball hits water | water_impact | Visible/permitted impact; do not play for hidden misses. |
| Ship collision | ship_bump | Visible collision; rate-limit sustained contact. |
| Ship destroyed | ship_sink | Visible/permitted destruction; start with the sinking visual. |
| Ship respawned | ship_respawn | Visible/permitted spawn, not the respawn timer starting. |
| Friendly ship critically damaged | low_health | Selected friendly ship; at most one per eight seconds. |
| Sails accelerate from rest | movement_start | Optional selected/nearby visible ship only. |
| Enemy flag picked up | flag_pickup | Authorized pickup, not an unobserved hidden event. |
| Flag handed to teammate | flag_give | Actual successful transfer; not the command request. |
| Flag placed at land site | flag_place | Successful shoreline placement, after validation. |
| Flag dropped into water | flag_drop_water | Visible/permitted drop or loss in water. |
| Own flag recovered | flag_recover | Actual return/recovery; follow game rule semantics. |
| Enemy flag delivered for score | flag_capture | Public scoring event; no hidden positional panning. |
| Own flag stolen | flag_lost | Only if the game explicitly reveals that event; not automatically global. |
| Button clicked | ui_click | UI only; optional hover uses ui_hover. |
| Back / confirm / rejected command | ui_back / ui_confirm / ui_error | UI feedback only; no gameplay state mutation. |
| Pause / resume | ui_pause / ui_resume | Apply playback control as well as emitting the optional cue. |
| Notification | ui_notification | Visible UI notification; throttle background updates. |
| Countdown / match starts | countdown_tick / match_start | Once per displayed countdown beat / start event. |
| Match ends | match_victory / match_defeat / match_draw | Choose according to the viewer perspective; never all three. |
| Tournament finished | tournament_complete | Once for the classroom presentation, not once per match. |
| Training starts / ends | training_start / training_complete | Only the actively viewed training session. |
| Checkpoint saved | checkpoint_saved | Optional; do not sound for every automatic save. |
| Agent validation result | validation_pass / validation_fail | One cue when visible validation finishes. |
| Visible arena ambience | ocean_calm_loop OR ocean_harbor_loop | One optional global bed; off by default; no hidden-state dependency. |
