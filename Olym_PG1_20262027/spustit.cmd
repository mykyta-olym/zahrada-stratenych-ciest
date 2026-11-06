@echo off
rem Zahrada stratenych ciest - spustenie cez lokalny webovy server.
rem Prehliadac nenacita moduly JavaScriptu priamo zo suboru, preto je potrebny server.
rem Server posiela hlavicku Cache-Control: no-store, aby prehliadac po uprave hry
rem nepouzil stare subory z vyrovnavacej pamate (zmes starych a novych modulov).
rem Port 8137 je zvoleny tak, aby nekolidoval s beznymi vyvojovymi servermi (8000, 8080).
rem Rad cakajucich spojeni je 64 (predvolenych 5 nestaci - prehliadac pri nacitani hry
rem posle naraz desiatky poziadaviek a niektore by server odmietol).
rem Alternativa bez tohto suboru: otvorit priecinok vo WebStorme a spustit index.html.
cd /d "%~dp0"
set PORT=8137
set URL=http://localhost:%PORT%/

rem prehliadac sa otvori o sekundu neskor, ked uz server bezi
where python >nul 2>nul && (
    start "" /b cmd /c "ping -n 2 127.0.0.1 >nul & start %URL%"
    python -c "import http.server as s; H = s.SimpleHTTPRequestHandler; e = H.end_headers; H.end_headers = lambda self: (self.send_header('Cache-Control', 'no-store'), e(self)); s.ThreadingHTTPServer.request_queue_size = 64; s.test(H, port=%PORT%, bind='127.0.0.1')"
    exit /b
)
where node >nul 2>nul && (
    start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & start %URL%"
    npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1
    exit /b
)
echo Nenasiel sa Python ani Node.js.
echo Otvorte priecinok vo WebStorme a spustite index.html (Open In - Browser).
pause
