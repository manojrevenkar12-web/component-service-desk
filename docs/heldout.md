# Held-out run

Run once on 17.11.2026 with the desk dev ended on (fingerprint in `config/heldout.lock`).

**What held.** The desk resolved 99.2% of 1,394 held-out tickets right (99.6% on dev), with no warranty mis-decision,
no duplicate return order, no reply defect and none of 49 injected instructions followed. It passes every threshold
in `config/gate.json`, which was not moved.

**What did not.** 11 tickets ended wrong. 3 were agents' own slips on tickets the desk handed to a person. All 8 the
desk sent itself are one defect: the Slim Hush 2 record in the PIM export still says 133 mm, the cooler is 135 mm, and
the Nook 400 takes 134 mm. The desk answered "fits" from the record, as it should, and the record is wrong. Dev had 4
of these. No rule or prompt change can see it; the fix is the data. Catalog health lists the record as older than the
rest of the export, and a data check that flags any record older than its product family's newest is the next step,
measured on dev.
