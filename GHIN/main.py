import numpy as np
from GHIN import ghin
import csv
import pandas as pd

start = input("Add another round? (y/n): ").lower()

with open("ghin_result.csv", "a", newline="") as file:
    writer = csv.writer(file)

    while start == "y":
        ags = int(input("Gross Score: "))
        cr = float(input("Course Rating: "))
        sr = int(input("Slope Rating: "))

        result = round(ghin(ags, cr, sr), 1)

        writer.writerow([ags, cr, sr, result])

        start = input("Add another round? (y/n): ").lower()

data = pd.read_csv("ghin_result.csv")
data.columns = ['AGS', 'CR', 'SR', 'Diff']
recent20 = data.sort_values(by="Diff").head(20)
# print(recent20)
top8 = recent20.head(8)
# print(top8)
diff_sum = top8["Diff"].sum()
print(round(diff_sum / 8, 1))