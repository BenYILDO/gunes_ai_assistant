' Gunes launcher - runs at Windows startup (hidden window).
' Starts the local server if it is not running, then opens the app window.
' Usage: wscript start-gunes.vbs [/silent]   (/silent = do not open the window)
Option Explicit
Dim sh, fso, root, port, url, i, silent, envFile, line, f

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
silent = (WScript.Arguments.Count > 0)

' Read GUNES_PORT from .env (default 4317)
port = "4317"
envFile = root & "\.env"
If fso.FileExists(envFile) Then
  Set f = fso.OpenTextFile(envFile, 1)
  Do Until f.AtEndOfStream
    line = Trim(f.ReadLine)
    If Left(line, 11) = "GUNES_PORT=" Then
      If Len(Mid(line, 12)) > 0 Then port = Mid(line, 12)
    End If
  Loop
  f.Close
End If
url = "http://localhost:" & port

Function IsUp()
  On Error Resume Next
  Dim http
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  http.setTimeouts 1500, 1500, 1500, 1500
  http.Open "GET", url & "/api/status", False
  http.Send
  IsUp = (Err.Number = 0 And http.Status = 200)
  On Error GoTo 0
End Function

If Not IsUp() Then
  If Not fso.FolderExists(root & "\data") Then fso.CreateFolder(root & "\data")
  sh.CurrentDirectory = root
  sh.Run "cmd /c node server\dist\index.js >> data\gunes.log 2>&1", 0, False
  For i = 1 To 60
    WScript.Sleep 500
    If IsUp() Then Exit For
  Next
End If

If Not silent Then
  ' Frameless app window in Edge; autoplay allowed so the greeting can speak.
  sh.Run "cmd /c start """" msedge --app=" & url & " --autoplay-policy=no-user-gesture-required --window-size=1600,960", 0, False
End If
