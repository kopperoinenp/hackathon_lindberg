# Source datasets

The supplied synthetic dataset is stored unchanged in this directory. The Excel
workbook contains all source tables, baselines, assumptions and the data dictionary.
All customer and operational figures are fictional/illustrative; they are not
approved Lindström customer claims. Do not add real customer data or credentials.

The frontend fixture can be regenerated from the repository root:

```sh
python frontend/mockups/kopperoinenp/extract_fixture.py data/source/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx
```
