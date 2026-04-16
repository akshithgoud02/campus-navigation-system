@echo off
echo.
echo  ============================================
echo   CampusNav - College Classroom Finder
echo   MySQL Edition
echo  ============================================
echo.
cd /d "%~dp0backend"
echo  Step 1: Edit .env and set your MySQL password
echo.
pause
echo  Step 2: Installing dependencies...
call npm install
echo.
echo  Step 3: Creating MySQL database and tables...
call npm run setup
echo.
echo  Step 4: Starting server...
echo  Open browser at: http://localhost:3000
echo.
call npm start
pause
