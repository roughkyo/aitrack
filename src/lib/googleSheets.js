// Google Sheets 데이터를 실시간으로 가져오는 유틸리티

/**
 * Google Sheets를 CSV 형식으로 가져오기
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {string} sheetName - 시트 이름 (선택사항)
 * @returns {Promise<string>} CSV 형식의 데이터
 */
export async function fetchGoogleSheetAsCSV(spreadsheetId, sheetName = '') {
    try {
        // Google Sheets를 CSV로 export하는 URL
        const gid = sheetName ? `&gid=${sheetName}` : '';
        // Add cache busting timestamp
        const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gid}&t=${Date.now()}`;

        console.log('📊 Google Sheets 데이터 가져오는 중 (캐시 방지)...');

        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            throw new Error(`Google Sheets 데이터 가져오기 실패: ${response.status}`);
        }

        const csvData = await response.text();
        console.log('✅ Google Sheets 데이터 로드 완료');

        return csvData;
    } catch (error) {
        console.error('❌ Google Sheets 데이터 로드 실패:', error);
        throw error;
    }
}

/**
 * Google Sheets API를 사용하여 데이터 가져오기 (API 키 필요)
 * @param {string} spreadsheetId - Google Sheets ID
 * @param {string} range - 범위 (예: 'Sheet1!A1:Z100')
 * @param {string} apiKey - Google Sheets API 키
 * @returns {Promise<Array>} JSON 형식의 데이터
 */
export async function fetchGoogleSheetWithAPI(spreadsheetId, range, apiKey) {
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

        console.log('📊 Google Sheets API로 데이터 가져오는 중...');

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Google Sheets API 호출 실패: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ Google Sheets API 데이터 로드 완료');

        return data.values || [];
    } catch (error) {
        console.error('❌ Google Sheets API 데이터 로드 실패:', error);
        throw error;
    }
}
