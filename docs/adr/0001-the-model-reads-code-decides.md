# 1. The model reads, code decides

## Context
Compatibility and warranty answers are commitments: a customer buys a cooler on our word, a warehouse ships an
exchange unit. A model answering alone was right on 83% of dev tickets and followed injected instructions in 21 of 47
messages that carried one.

## Decision
The model returns quotes from the message and the invoice. Code checks each quote is in the text, resolves products
by identifier, applies the published rules, and states the decision as facts. The model then words those facts.

## Consequences
Wrong answers fall to 0.4% and injected instructions have nothing to act on. The rules must be kept with the
catalog: a rule the desk does not know sends the question to a person, never to a guess. The `no_rules` ablation keeps
the measurement honest: the same records, a model deciding, 3.3% wrong answers.
