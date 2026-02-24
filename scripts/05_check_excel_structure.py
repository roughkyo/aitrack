import pandas as pd
excel_path = r'c:\Users\ysj\Desktop\upload_all\자공고이수트랙\certification\인증용_학생명렬표.xlsx'
xl = pd.ExcelFile(excel_path)
print("Sheet Names:", xl.sheet_names)
for sheet in xl.sheet_names:
    df = pd.read_excel(excel_path, sheet_name=sheet)
    print(f"\n--- Sheet: {sheet} ---")
    print("Columns:", df.columns.tolist())
    print(df.head(2))
