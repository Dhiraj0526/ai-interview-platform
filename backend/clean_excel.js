const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const EXCEL_PATH = path.join(__dirname, "assessment_results.xlsx");

if (fs.existsSync(EXCEL_PATH)) {
  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  let data = XLSX.utils.sheet_to_json(worksheet);

  // Re-map the data to strictly enforce the columns and sequence
  const cleanedData = data.map((row, index) => ({
    "S.No": index + 1,
    "Candidate Name": row["Candidate Name"] || row["Name"] || "N/A",
    "Roll Number": row["Roll Number"] || row["Roll No"] || "N/A",
    "Date": row["Date"] || "N/A",
    "Aptitude": row["Aptitude"] || 0,
    "Coding": row["Coding"] || 0,
    "Start Time": row["Start Time"] || "N/A",
    "End Time": row["End Time"] || "N/A",
    "Interview Score": row["Interview Score"] || row["Interview"] || 0,
    "Total Score": row["Total Score"] || ((row["Aptitude"] || 0) + (row["Coding"] || 0) + (row["Interview Score"] || row["Interview"] || 0))
  }));

  const newWorkbook = XLSX.utils.book_new();
  const newSheet = XLSX.utils.json_to_sheet(cleanedData);
  XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Results");
  
  XLSX.writeFile(newWorkbook, EXCEL_PATH);
  console.log("Excel file successfully cleaned and re-sequenced.");
} else {
  console.log("No Excel file found to clean.");
}
