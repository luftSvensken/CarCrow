# Lokal rekommendationsmodell

CarCrow 0.3 använder den verkliga textencodern i [Google EmbeddingGemma 2](https://huggingface.co/google/embeddinggemma-2), med modellens officiella query/document-prompter, medelpoolning, 256 dimensioner och normalisering. Rekommendationer räknas med kosinuslikhet mot sparade bilar eller senaste sökningar. Int8-vikter och högst 256 token gör modellen praktisk att paketera. Den kvantiserade exporten har jämförts med originalmodellen; överensstämmelsen var 0,988–0,992 i tre svenska testtexter.

Appen kör ONNX på CPU i en separat Node-arbetstråd. Ingen Python-installation, modellnedladdning eller molninferens behövs efter installation. Modellfiler och Apache 2.0-licens följer med installationspaketen.

## Återskapa modellfilerna

Använd Python 3.12 på en stödd utvecklarmaskin (Apple Silicon, Windows x64 eller Linux x64). Export kräver flera GB ledigt utrymme och minne. Färdig export kan användas på både Apple Silicon och Intel-Mac, samt Windows x64.

```sh
python -m pip install -r scripts/requirements-model.txt
python scripts/export-embeddinggemma2.py
node scripts/check-embeddings.cjs
```

Exporten skrivs till `models/embeddinggemma-2/`, som Git ignorerar. Den kan också kopieras från en verifierad export. `CARCROW_MODEL_CACHE` och `CARCROW_ONNX_OUTPUT` kan styra byggmapparna. Dessa är utvecklarinställningar och saknar reglage i appen.

ONNX Runtime Node 1.22.0 används eftersom den innehåller CPU-motor för Intel-Mac. Dess installationshjälpare har uppdaterade beroenden via package.json-overrides. Produktionsberoenden kontrolleras med npm audit. OpenRouter används separat för chatten och är låst till `openrouter/free`.
