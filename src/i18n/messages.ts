export type AppLocale = 'en' | 'pt-BR'

export type MessageKey =
  | 'boot.sequence'
  | 'boot.fault'
  | 'boot.retry'
  | 'boot.bridgeMissing'
  | 'brand.subtitle'
  | 'brand.subtitleMulti'
  | 'status.linkUp'
  | 'status.handshake'
  | 'status.fault'
  | 'status.idle'
  | 'ops.autoRelink'
  | 'ops.reloadProfiles'
  | 'ops.killAll'
  | 'ops.parkTray'
  | 'ops.startWithLinux'
  | 'ops.language'
  | 'ops.desk'
  | 'ops.noneActive'
  | 'ops.deskSummary'
  | 'ops.newProfile'
  | 'ops.importConf'
  | 'profiles.emptyTitle'
  | 'profiles.emptyBody'
  | 'profiles.live'
  | 'profiles.handshake'
  | 'profiles.bringUp'
  | 'profiles.killLink'
  | 'profiles.noUser'
  | 'profiles.edit'
  | 'profiles.delete'
  | 'profiles.deleteConfirm'
  | 'console.title'
  | 'console.working'
  | 'console.clear'
  | 'console.empty'
  | 'setup.missing'
  | 'setup.homebrew'
  | 'setup.needsClient'
  | 'setup.looksLike'
  | 'setup.installPlan'
  | 'setup.noAutoInstall'
  | 'setup.installNow'
  | 'setup.working'
  | 'setup.recheck'
  | 'setup.stillMissing'
  | 'setup.installFailed'
  | 'tray.show'
  | 'tray.disconnectAll'
  | 'tray.refresh'
  | 'tray.checkUpdates'
  | 'tray.quit'
  | 'notify.connectedTitle'
  | 'notify.connectedBody'
  | 'notify.disconnectedTitle'
  | 'notify.disconnectedBody'
  | 'notify.updateTitle'
  | 'notify.updateBody'
  | 'form.createTitle'
  | 'form.editTitle'
  | 'form.importTitle'
  | 'form.id'
  | 'form.idHint'
  | 'form.host'
  | 'form.port'
  | 'form.username'
  | 'form.password'
  | 'form.passwordHint'
  | 'form.trustedCert'
  | 'form.trustedCertHint'
  | 'form.realm'
  | 'form.optional'
  | 'form.extraOptions'
  | 'form.persistent'
  | 'form.persistentHint'
  | 'form.setDns'
  | 'form.setRoutes'
  | 'form.save'
  | 'form.saving'
  | 'form.cancel'
  | 'update.available'
  | 'update.aptHint'
  | 'update.open'
  | 'update.dismiss'
  | 'update.checkNow'
  | 'update.checking'
  | 'update.upToDate'
  | 'update.checkFailed'
  | 'theme.system'
  | 'theme.light'
  | 'theme.dark'

type Dict = Record<MessageKey, string>

const en: Dict = {
  'boot.sequence': 'boot sequence…',
  'boot.fault': 'Boot fault',
  'boot.retry': 'Retry',
  'boot.bridgeMissing':
    'Electron bridge missing (window.myVpns). Run with npm run dev — do not open localhost in the browser alone.',
  'brand.subtitle': 'OpenForti control desk',
  'brand.subtitleMulti': 'OpenForti control desk · multi-link',
  'status.linkUp': 'LINK UP',
  'status.handshake': 'HANDSHAKE',
  'status.fault': 'FAULT',
  'status.idle': 'IDLE',
  'ops.autoRelink': 'Auto-relink',
  'ops.reloadProfiles': 'Reload profiles',
  'ops.killAll': 'Kill all links',
  'ops.parkTray': 'Park in tray',
  'ops.startWithLinux': 'Start at login',
  'ops.language': 'Language',
  'ops.desk': 'Desk',
  'ops.noneActive': 'none active',
  'ops.deskSummary': '{up} up · {handshake} handshake',
  'ops.newProfile': 'New profile',
  'ops.importConf': 'Import .conf',
  'profiles.emptyTitle': 'No profiles',
  'profiles.emptyBody':
    'Create a profile or import an existing openfortivpn .conf file.',
  'profiles.live': 'live · {uptime}',
  'profiles.handshake': 'handshake…',
  'profiles.bringUp': 'Bring up',
  'profiles.killLink': 'Kill link',
  'profiles.noUser': 'no-user',
  'profiles.edit': 'Edit',
  'profiles.delete': 'Delete',
  'profiles.deleteConfirm': 'Delete profile "{id}"?',
  'console.title': 'Console // {label}',
  'console.working': ' · working',
  'console.clear': 'Clear',
  'console.empty':
    'Waiting for tunnel I/O. You can bring up multiple VPNs at once — each keeps its own link.',
  'setup.missing': 'Missing dependency',
  'setup.homebrew': 'Install Homebrew from brew.sh first, then run brew install openfortivpn and recheck.',
  'setup.needsClient':
    'My VPNs needs {engine} to open SSL tunnels. Your operating system:',
  'setup.looksLike': '{distro}',
  'setup.installPlan': 'Install plan · {family}',
  'setup.noAutoInstall': 'No automatic installer for this distro',
  'setup.installNow': 'Install now',
  'setup.working': 'Working…',
  'setup.recheck': 'I installed it — recheck',
  'setup.stillMissing': 'The VPN client is still missing or cannot run.',
  'setup.installFailed': 'Could not install the VPN client.',
  'tray.show': 'Show My VPNs',
  'tray.disconnectAll': 'Disconnect all',
  'tray.refresh': 'Refresh profiles',
  'tray.checkUpdates': 'Check for updates',
  'tray.quit': 'Quit',
  'notify.connectedTitle': 'VPN connected',
  'notify.connectedBody': 'Tunnel {id} is up.',
  'notify.disconnectedTitle': 'VPN disconnected',
  'notify.disconnectedBody': 'Tunnel {id} ended.',
  'notify.updateTitle': 'My VPNs update available',
  'notify.updateBody':
    'Version {latest} is out (you have {current}). Click to open the release.',
  'form.createTitle': 'New connection',
  'form.editTitle': 'Edit connection',
  'form.importTitle': 'Import connection',
  'form.id': 'Profile id',
  'form.idHint': 'Profile filename (a-z, 0-9, - _)',
  'form.host': 'Host',
  'form.port': 'Port',
  'form.username': 'Username',
  'form.password': 'Password',
  'form.passwordHint': 'Stored in the .conf (same as your current setup)',
  'form.trustedCert': 'Trusted cert',
  'form.trustedCertHint': 'SHA256 fingerprint from openfortivpn / gateway',
  'form.realm': 'Realm',
  'form.optional': 'Optional',
  'form.extraOptions': '{count} additional imported options are preserved. Unsupported options will be reported before connecting.',
  'form.persistent': 'Persistent (sec)',
  'form.persistentHint': '0 = off · reconnect interval used by openfortivpn',
  'form.setDns': 'set-dns',
  'form.setRoutes': 'set-routes',
  'form.save': 'Save profile',
  'form.saving': 'Saving…',
  'form.cancel': 'Cancel',
  'update.available': 'Update available · {latest} (you have {current})',
  'update.aptHint': 'Download the installer for your operating system from the release page.',
  'update.open': 'Release notes',
  'update.dismiss': 'Dismiss',
  'update.checkNow': 'Check for updates',
  'update.checking': 'Checking…',
  'update.upToDate': 'You are up to date ({version})',
  'update.checkFailed': 'Could not check right now — it will retry.',
  'theme.system': 'Follow system theme',
  'theme.light': 'Light theme',
  'theme.dark': 'Dark theme',
}

const ptBR: Dict = {
  'boot.sequence': 'sequência de boot…',
  'boot.fault': 'Falha no boot',
  'boot.retry': 'Tentar de novo',
  'boot.bridgeMissing':
    'Bridge do Electron ausente (window.myVpns). Rode com npm run dev — não abra só o localhost no navegador.',
  'brand.subtitle': 'Mesa de controle OpenForti',
  'brand.subtitleMulti': 'Mesa de controle OpenForti · multi-link',
  'status.linkUp': 'LINK UP',
  'status.handshake': 'HANDSHAKE',
  'status.fault': 'FALHA',
  'status.idle': 'OCIOSO',
  'ops.autoRelink': 'Auto-reconectar',
  'ops.reloadProfiles': 'Recarregar perfis',
  'ops.killAll': 'Derrubar todos',
  'ops.parkTray': 'Ir para a bandeja',
  'ops.startWithLinux': 'Iniciar ao entrar',
  'ops.language': 'Idioma',
  'ops.desk': 'Mesa',
  'ops.noneActive': 'nenhuma ativa',
  'ops.deskSummary': '{up} ativas · {handshake} handshake',
  'ops.newProfile': 'Novo perfil',
  'ops.importConf': 'Importar .conf',
  'profiles.emptyTitle': 'Nenhum perfil',
  'profiles.emptyBody':
    'Crie um perfil ou importe um arquivo .conf existente do openfortivpn.',
  'profiles.live': 'ao vivo · {uptime}',
  'profiles.handshake': 'handshake…',
  'profiles.bringUp': 'Conectar',
  'profiles.killLink': 'Desligar',
  'profiles.noUser': 'sem-usuário',
  'profiles.edit': 'Editar',
  'profiles.delete': 'Excluir',
  'profiles.deleteConfirm': 'Excluir o perfil "{id}"?',
  'console.title': 'Console // {label}',
  'console.working': ' · trabalhando',
  'console.clear': 'Limpar',
  'console.empty':
    'Aguardando I/O do túnel. Dá pra subir várias VPNs ao mesmo tempo — cada uma mantém o próprio link.',
  'setup.missing': 'Dependência ausente',
  'setup.homebrew': 'Instale o Homebrew em brew.sh, execute brew install openfortivpn e verifique novamente.',
  'setup.needsClient':
    'O My VPNs precisa do {engine} para abrir túneis SSL. Seu sistema:',
  'setup.looksLike': '{distro}',
  'setup.installPlan': 'Plano de instalação · {family}',
  'setup.noAutoInstall': 'Instalação automática indisponível nesta distro',
  'setup.installNow': 'Instalar agora',
  'setup.working': 'Trabalhando…',
  'setup.recheck': 'Já instalei — verificar de novo',
  'setup.stillMissing': 'O cliente VPN ainda está ausente ou não pode ser executado.',
  'setup.installFailed': 'Não foi possível instalar o cliente VPN.',
  'tray.show': 'Mostrar My VPNs',
  'tray.disconnectAll': 'Desconectar todas',
  'tray.refresh': 'Atualizar perfis',
  'tray.checkUpdates': 'Verificar atualizações',
  'tray.quit': 'Sair',
  'notify.connectedTitle': 'VPN conectada',
  'notify.connectedBody': 'Túnel {id} está ativo.',
  'notify.disconnectedTitle': 'VPN desconectada',
  'notify.disconnectedBody': 'Túnel {id} encerrou.',
  'notify.updateTitle': 'Atualização do My VPNs disponível',
  'notify.updateBody':
    'Saiu a versão {latest} (você tem {current}). Clique para abrir a release.',
  'form.createTitle': 'Nova conexão',
  'form.editTitle': 'Editar conexão',
  'form.importTitle': 'Importar conexão',
  'form.id': 'ID do perfil',
  'form.idHint': 'Nome do arquivo do perfil (a-z, 0-9, - _)',
  'form.host': 'Host',
  'form.port': 'Porta',
  'form.username': 'Usuário',
  'form.password': 'Senha',
  'form.passwordHint': 'Fica no .conf (igual ao setup atual)',
  'form.trustedCert': 'Trusted cert',
  'form.trustedCertHint': 'Fingerprint SHA256 do openfortivpn / gateway',
  'form.realm': 'Realm',
  'form.optional': 'Opcional',
  'form.extraOptions': '{count} opções adicionais importadas serão preservadas. Opções incompatíveis serão informadas antes da conexão.',
  'form.persistent': 'Persistent (seg)',
  'form.persistentHint': '0 = off · intervalo de reconexão do openfortivpn',
  'form.setDns': 'set-dns',
  'form.setRoutes': 'set-routes',
  'form.save': 'Salvar perfil',
  'form.saving': 'Salvando…',
  'form.cancel': 'Cancelar',
  'update.available': 'Atualização disponível · {latest} (você tem {current})',
  'update.aptHint': 'Baixe o instalador do seu sistema na página da versão.',
  'update.open': 'Notas da release',
  'update.dismiss': 'Dispensar',
  'update.checkNow': 'Verificar atualizações',
  'update.checking': 'Verificando…',
  'update.upToDate': 'Você está atualizado ({version})',
  'update.checkFailed': 'Não deu para verificar agora — vou tentar de novo.',
  'theme.system': 'Seguir o tema do sistema',
  'theme.light': 'Tema claro',
  'theme.dark': 'Tema escuro',
}

const catalogs: Record<AppLocale, Dict> = {
  en,
  'pt-BR': ptBR,
}

export function translate(
  locale: AppLocale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  let text = catalogs[locale][key] ?? catalogs.en[key] ?? key
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}

export function listLocales(): AppLocale[] {
  return ['en', 'pt-BR']
}

export function catalogKeys(locale: AppLocale): MessageKey[] {
  return Object.keys(catalogs[locale]) as MessageKey[]
}
