import * as XLSX from 'xlsx';
import {
  detectHeaderRow,
  parseSheet,
  generateSql,
  sanitizeIdentifier,
} from '../src/lib/sqlGen';

// --- Scenario 1: title/logo block above the real header row (MOHAP-style file) ---
const aoa = [
  ['UNITED ARAB EMIRATES'],
  ['MINISTRY OF HEALTH & PREVENTION'],
  [],
  [],
  ['Statistics & Research Center'],
  [],
  ['Year', 'Emirate En', 'Emirate Ar', 'Geo Coordinates', 'Nationality Group En', 'Nationality Group Ar', 'Gender En', 'Gender Ar'],
  [2011, 'Ajman', 'عجمان', '25.4052° N, 55.5136° E', 'Citizen', 'مواطن', 'Female', 'انثي'],
  [2011, 'Ajman', 'عجمان', '25.4052° N, 55.5136° E', 'Citizen', 'مواطن', 'Male', 'ذكر'],
];
const ws1 = XLSX.utils.aoa_to_sheet(aoa);
const detected = detectHeaderRow(ws1);
console.log('Detected header row (1-based):', detected + 1, detected + 1 === 7 ? 'OK' : 'FAIL');
const parsed1 = parseSheet(ws1, detected);
console.assert(parsed1.headerKeys.join(',') === 'Year,Emirate En,Emirate Ar,Geo Coordinates,Nationality Group En,Nationality Group Ar,Gender En,Gender Ar', 'FAIL: header keys');
console.assert(parsed1.rows.length === 2, 'FAIL: row count');

// --- Scenario 2: escaping, auto-ID, JSON flatten, type inference, dialects ---
// Round-trip through an in-memory array buffer exactly the way App.tsx does
// (XLSX.read(..., { type: 'array', cellDates: true })) — json_to_sheet alone
// stores dates as bare numeric serials unless read back the same way a real
// browser upload is.
const data = [
  { ID: '', Name: "O'Brien Corp", Amount: 1234.5, Active: true, Signed: new Date('2024-01-15'), Meta: JSON.stringify([{ Service: 'Support', ServiceID: 'SVC-1' }]) },
  { ID: '', Name: 'Acme Inc', Amount: 900, Active: false, Signed: new Date('2024-02-20'), Meta: '' },
  { ID: 5, Name: '', Amount: null, Active: true, Signed: null, Meta: null },
];
const wsBuild = XLSX.utils.json_to_sheet(data, { cellDates: true });
const wbBuild = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbBuild, wsBuild, 'Sheet1');
const arrayBuffer: ArrayBuffer = XLSX.write(wbBuild, { type: 'array', bookType: 'xlsx' });

const wbRead = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
const ws2 = wbRead.Sheets[wbRead.SheetNames[0]];
const parsed2 = parseSheet(ws2, 0);

const resMysql = generateSql(parsed2.headerKeys, parsed2.rows, {
  tableName: sanitizeIdentifier('my_table'),
  dialect: 'mysql',
  insertMode: 'batch',
  batchSize: 500,
  autoId: true,
  blankNull: true,
  flatten: true,
  createTable: true,
});
console.log('\n--- MySQL output ---\n');
console.log(resMysql!.sql);
console.assert(resMysql!.sql.includes("O''Brien Corp"), 'FAIL: quote escaping');
console.assert(/PRIMARY KEY/.test(resMysql!.sql), 'FAIL: primary key');
console.assert(resMysql!.sql.includes('Meta_Service'), 'FAIL: JSON flatten column');
console.assert(resMysql!.sql.includes("'SVC-1'"), 'FAIL: flattened JSON value');
console.assert(resMysql!.sql.includes('1234.5'), 'FAIL: float preserved');
console.assert(/DATETIME/.test(resMysql!.sql), 'FAIL: date type inference');
console.assert(resMysql!.sql.startsWith('CREATE TABLE IF NOT EXISTS'), 'FAIL: mysql create table form');

const resMssql = generateSql(parsed2.headerKeys, parsed2.rows, {
  tableName: sanitizeIdentifier('my_table'),
  dialect: 'mssql',
  insertMode: 'single',
  batchSize: 500,
  autoId: true,
  blankNull: true,
  flatten: false,
  createTable: true,
});
console.log('\n--- SQL Server output (first lines) ---\n');
console.log(resMssql!.sql.split('\n').slice(0, 6).join('\n'));
console.assert(resMssql!.sql.startsWith('IF OBJECT_ID'), 'FAIL: mssql guard form');
console.assert(!resMssql!.sql.includes('CREATE TABLE IF NOT EXISTS'), 'FAIL: mssql should not use IF NOT EXISTS');
console.assert(resMssql!.sql.includes('[my_table]'), 'FAIL: mssql bracket quoting');

console.log('\nAll smoke-test assertions passed (no FAIL lines above means success).');
