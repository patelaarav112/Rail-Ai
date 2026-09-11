"""
Dumps the exact synthetic corpus services/nlu_scheduler.py trains the
natural-language block-intake classifiers on, as a plain CSV — so it's an
inspectable artifact instead of something that only ever exists inside a
training run. Re-running this always produces the identical file (the
generator uses a fixed random seed), so it's a snapshot, not a re-sample.

Usage:
    python scripts/export_nlu_dataset.py [output_path]
"""
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.nlu_scheduler import _generate_training_data  # noqa: E402


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "data", "nlu_training_data.csv"
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    texts, dept_y, section_y, priority_y, tb_y = _generate_training_data()

    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["text", "department", "section", "priority", "time_bucket"])
        for row in zip(texts, dept_y, section_y, priority_y, tb_y):
            writer.writerow(row)

    print(f"Wrote {len(texts)} rows to {os.path.abspath(out_path)}")


if __name__ == "__main__":
    main()
