# Examples

`run_parallel.py` exercises the simultaneous PettingZoo API. The CLI examples in the package README cover the learner-team rollout, Q-learning, DQN, frozen evaluation, and Dense JSON export.

Fleet slots are stable ID order, padded to eight. `ship_mask` identifies real slots; `action_mask` contains one 22-value mask per slot. Duel uses one 64-value row and one discrete action. Fleet never broadcasts one scalar action to every ship.
