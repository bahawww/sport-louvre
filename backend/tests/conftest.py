import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture(scope="session")
def art():
    import ml_pipeline

    return ml_pipeline.build_artifacts()


@pytest.fixture(scope="session")
def client(art):
    from fastapi.testclient import TestClient

    import main

    main.artifacts = art
    return TestClient(main.app)  # no context manager: lifespan (training) is not re-run
