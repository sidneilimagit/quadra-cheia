"""Gera app.html (versão publicada como Artifact) a partir de index.html.
O Artifact já fornece <!doctype>, <head> e <body>; aqui só ficam título, estilos, conteúdo e script."""
import re, pathlib
src = pathlib.Path(__file__).with_name("index.html").read_text(encoding="utf-8")
style = re.search(r"<style>.*?</style>", src, re.S).group(0)
body = re.search(r"<body>(.*)</body>", src, re.S).group(1)
# Ocupa a altura disponível do visualizador (que já desconta as áreas seguras do celular)
style = style.replace("</style>", "  html,body{height:100%}\n  body{min-height:0}\n  .phone{height:100%}\n</style>")
out = "<title>Quadra Cheia</title>\n" + style + "\n" + body.strip() + "\n"
pathlib.Path(__file__).with_name("app.html").write_text(out, encoding="utf-8")
print("app.html gerado")
