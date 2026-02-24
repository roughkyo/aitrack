import pandas as pd
excel_path = r'c:\Users\ysj\Desktop\upload_all\자공고이수트랙\certification\인증용_학생명렬표.xlsx'
xl = pd.ExcelFile(excel_path)
print("All Sheet Names:", xl.sheet_names)
