FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY features.py evaluation.py ml_pipeline.py main.py ./
COPY reports/before_metrics.json reports/metrics_report.md reports/laporan_analisis.pdf ./reports/

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "64", "--timeout-keep-alive", "5"]
