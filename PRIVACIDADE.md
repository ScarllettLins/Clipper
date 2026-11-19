# Política de Privacidade do Clipper

*Última atualização: 19 de novembro de 2026*

O Clipper é uma extensão para o Google Chrome que grava os últimos segundos da tela, tira prints com marcações e
corta vídeos. Esta política explica quais dados a extensão usa, onde eles ficam e o que acontece com eles.

## Resumo

- **O Clipper não coleta, não envia e não vende nenhum dado.**
- Tudo o que a extensão grava ou captura fica **somente no seu computador**.
- A extensão **não tem servidor**, não faz nenhuma requisição pela internet, não exige conta, não tem anúncios e
  não usa ferramentas de análise ou rastreamento.

## O que a extensão usa e onde fica

| Dado | Para quê | Onde fica | Por quanto tempo |
|---|---|---|---|
| Imagem da tela (vídeo e prints) | Gravar clipes e tirar prints, só depois que você escolhe a tela na janela do Chrome | Memória do navegador e banco local da extensão (IndexedDB) | Até você salvar ou descartar. Prints esquecidos são apagados sozinhos depois de 12 horas |
| Som do computador e do microfone | Incluir áudio no clipe, só se você escolher essa opção | Junto com o vídeo, no seu computador | Igual ao vídeo |
| Vídeos que você abre no trim | Cortar o vídeo | Banco local da extensão | Até você tirar o vídeo da fila |
| Configurações (buffer, FPS, qualidade, áudio, pasta) | Lembrar suas preferências | Armazenamento local da extensão (`chrome.storage.local`) | Até você desinstalar |
| Tema claro/escuro | Lembrar sua preferência | Armazenamento local da extensão | Até você desinstalar |
| Posição e tamanho dos monitores | Abrir as janelas de print no monitor que está sendo gravado | Armazenamento da sessão do navegador | Até fechar o navegador |
| Últimos 50 erros da extensão | Ajudar a investigar problemas | Armazenamento local da extensão | Substituídos pelos novos. Apagados ao desinstalar |

Os arquivos que você salva (prints e vídeos) vão para a pasta **Downloads** do seu computador, ou para a pasta que
você escolher em "Salvar como…". Os prints também são copiados para a sua área de transferência, para você colar
onde quiser.

Nenhum desses dados é enviado para a desenvolvedora nem para qualquer outra pessoa ou empresa.

## Captura da tela

O Clipper **nunca** captura a tela por conta própria. O próprio Chrome mostra uma janela onde você escolhe o monitor,
a cada gravação e a cada print feito sem gravação. Enquanto a tela está sendo gravada, o Chrome mostra o aviso de
compartilhamento, e você pode parar a qualquer momento.

O conteúdo da tela pode incluir informações pessoais suas ou de outras pessoas. Ele fica apenas no seu computador. O
que você faz com os arquivos salvos, como enviar um print para alguém, é escolha e responsabilidade sua. Use a
ferramenta **pixelar** para esconder dados sensíveis antes de compartilhar.

## Permissões

| Permissão | Por que é necessária |
|---|---|
| `desktopCapture` | Mostrar a janela do Chrome para você escolher o monitor e gravar ou capturar essa tela |
| `downloads` | Salvar os prints e vídeos na pasta Downloads e abrir a pasta onde eles foram salvos |
| `notifications` | Avisar o resultado das ações feitas por atalho (por exemplo, "Print salvo") |
| `storage` | Guardar suas configurações no computador |
| `system.display` | Saber a posição dos monitores para abrir as janelas no monitor certo |
| `unlimitedStorage` | Guardar clipes de vídeo grandes na fila até você salvar ou descartar |

O microfone só é usado se você escolher "Microfone" nas configurações. O Chrome pede a sua autorização antes.

## Como apagar seus dados

- **Um clipe ou vídeo da fila:** no trim, passe o mouse sobre ele e clique no **×**.
- **Um print:** clique em **Descartar** na janela do print.
- **Tudo:** desinstale a extensão. O Chrome apaga todos os dados guardados por ela. Os arquivos que você já salvou
  em Downloads continuam lá, porque são seus.

## Crianças

O Clipper não é direcionado a crianças e não coleta dados de ninguém, de nenhuma idade.

## Mudanças nesta política

Se a extensão mudar a forma como usa dados, esta página será atualizada antes da nova versão, com a nova data no
topo. O histórico de mudanças fica registrado neste repositório.

## Contato

Dúvidas ou problemas: abra uma *issue* na aba **Issues** deste repositório no GitHub.
