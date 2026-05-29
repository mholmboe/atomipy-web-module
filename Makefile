.PHONY: prebuilt test

prebuilt:
	@echo "Running prebuilt generator..."
	@PYTHONPATH=./backend/core python3 scripts/prebuilt_generator.py

test:
	@echo "Running test suite..."
	@pytest tests/
