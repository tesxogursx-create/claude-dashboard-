Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\Bas1n\claude-dashboard && node_modules\.bin\electron .", 0, False
