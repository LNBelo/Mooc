/* Qualquer JavaScript colocado aqui será carregado por todos os usuários em cada página carregada. */
/**
 * Esse arquivo JS é parte do MOOC Addin.
 * 
 * Autores:
 * @author Sebastian Schlicht (https://en.wikiversity.org/wiki/User:Sebschlicht)
 * @author René Pickhardt (http://www.rene-pickhardt.de/)
 * 
 * Esse código JS contém parâmetros de configuração para a interface de MOOC Addin.
 * Quando portado para outra instância do MediaWiki, esse código pode ser alterado, se necessário, para que o MOOC Addin funcione corretamente.
 */
/* necessário para evitar interpretação de sequências de caracteres especiais, como inscrições */
// <nowiki>
 
AddinMooc_CONFIG.set('LOG_LEVEL', 0);// -1: off, 0: debug, 1: production
AddinMooc_CONFIG.set('MW_ROOT_URL', 'https://pt.wikiversity.org/w/index.php');
AddinMooc_CONFIG.set('MW_API_URL', 'https://pt.wikiversity.org/w/api.php');
AddinMooc_CONFIG.set('MW_NAMESPACE_TALK', 'Talk');
AddinMooc_CONFIG.set('MW_NAMESPACE_USER', 'User');
AddinMooc_CONFIG.set('MW_PAGE_CONTRIBUTIONS', 'Special:Contributions');
AddinMooc_CONFIG.set('UI_THREAD_COLLAPSED_NUMCHARACTERS', 100);
AddinMooc_CONFIG.set('UI_SECTION_COLLAPSED_HEIGHT', 40);
AddinMooc_CONFIG.set('USER_AGENT_EMAIL', 'sebschlicht@uni-koblenz.de');
AddinMooc_CONFIG.set('USER_AGENT_NAME', 'MOOC-JS');
AddinMooc_CONFIG.set('USER_AGENT_URL', 'https://en.wikiversity.org/wiki/User:Sebschlicht');
 
AddinMooc_CONFIG.LOADED += 1;
 
// </nowiki>
