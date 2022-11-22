/**
 * Esse arquivo JavaScript é parte do MOOC Addin.
 * 
 * Autores:
 * @author Sebastian Schlicht (https://en.wikiversity.org/wiki/User:Sebschlicht)
 * @author René Pickhardt (http://www.rene-pickhardt.de/)
 * 
 * O código JavaScript faz uso extensivo de JQuery e permite recursos principais da interface de usuário, como:
 *   1.) navegação
 *   2.) efeitos de deslocamento
 *   3.) caixas modais para edições locais
 *   4.) inserção de discussão na página
 *
 * O MediaWiki API (https://www.mediawiki.org/wiki/API:Main_page) é usado para fazer edições, postar e recuperar o Índice MOOC (MoocIndex).
 * Para algumas solicitações e para o uso de mensagens, o MediaWiki JS API (https://doc.wikimedia.org/mediawiki-core/master/js/#!/api/mw.Api) é usado adicionalmente.
 * 
 * Notas:
 *
 * A refatoração adicional deve incluir todas as funções e variáveis globais com "AddinMooc_".
 *
 * O estilo de alguns elementos depende do estado de aplicação, como a posição da barra de rolagem e, portanto, requer o uso de JavaScript.
 * Assim, algumas diretrizes CSS não estão incluídas no arquivo CSS, mas são configuradas dinamicamente.
 * No futuro, isso pode/dee ser separado em:
 *   1.) Diretrizes CSS limitadas a uma classe de estado e
 *   2.) Código JavaScript que permite/desabilita essas classes de estado
 */
// <nowiki>

var AddinMooc_VERSION = '0.2';

/**
 * Objeto de configuração global para trabalhar com constantes e mensagens.
 */
var AddinMooc_CONFIG = {
  LOADED: 0,
  MSG_PREFIX: 'AddinMooc-',
  store: {},
  get: function(key) {
    return this.store[key];
  },
  set: function(key, value) {
    this.store[key] = value;
  },
  log: function(logLevel, key, params) {
    if (arguments.length > 0) {
      var minLevel = arguments[0];
      var crrLevel = this.get('LOG_LEVEL');
      if (crrLevel != -1 && minLevel >= crrLevel) {
        var msgParams = [];
        for (var i = 1; i < arguments.length; ++i) {
          msgParams[i - 1] = arguments[i];
        }
        console.log(this.message.apply(this, msgParams));
      }
    }
  },
  message: function(key, params) {
    var msgParams = [];
    msgParams[0] = this.MSG_PREFIX + key;
    for (var i = 1; i < arguments.length; ++i) {
      msgParams[i] = arguments[i];
    }
    // construtor de mensagens de chamada com parâmetros de função adicionais em objeto separado
    return mw.message.apply(mw.message, msgParams).text();
  },
  setMessage: function(key, message) {
    mw.messages.set(this.MSG_PREFIX + key, message);
  }
};

/*####################
  # PONTO DE ENTRADA
  # inicialização do sistema
  ####################*/

// carrega a configuração
importScript('MediaWiki:Common.js/addin-mooc-config.js');

// carrega as mensagens
importScript('MediaWiki:Common.js/addin-mooc-localization.js');

//DEBUG
var execOnReady = function(callback) {
  if (AddinMooc_CONFIG.LOADED < 2) {
    setTimeout(function() {
      execOnReady(callback);
    }, 200);
  } else {
    callback();
  }
};

// declara variáveis globais
var PARAMETER_KEY = {
  FURTHER_READING: 'furtherReading',
  LEARNING_GOALS: 'learningGoals',
  NUM_THREADS: 'numThreads',
  NUM_THREADS_OPEN: 'numThreadsOpen',
  VIDEO: 'video'
};
var AddinMooc_root;
var _base;
var _fullPath;
var _indexSection;
var _indexTitle;
var _index;
var nItemNav;
var sidebar;
var discussion;

// registra onHashChange para expandir seções navegadas através de âncoras
if ("onhashchange" in window) {
  window.onhashchange = function() {
    hashChanged(window.location.hash);
  };
} else {
  var prevHash = window.location.hash;
  window.setInterval(function() {
    if (window.location.hash != prevHash) {
      prevHash = window.location.hash;
      hashChanged(prevHash);
    }
  }, 100);
}

execOnReady(function() {

// carrega jQuery
$(document).ready(function() {
  // configura o agente de usuário para solicitações de API
  $.ajaxSetup({
    beforeSend: function(request) {
      request.setRequestHeader("User-Agent", AddinMooc_CONFIG.get('USER_AGENT_NAME') + '/' + AddinMooc_VERSION + ' (' + AddinMooc_CONFIG.get('USER_AGENT_URL') + '; ' + AddinMooc_CONFIG.get('USER_AGENT_EMAIL') + ')');
    }
  });
	
  // conecta à interface de usuário via DOM tree
  AddinMooc_root = $('#addin-mooc');
  _base = $('#baseUrl').text();
  _fullPath = $('#path').text();
  _indexSection = $('#section').text();
  _indexTitle = $('#indexUrl').text();
  nItemNav = $('#item-navigation');
  sidebar = $('#navigation');
  
  if (AddinMooc_root.length === 0) {// não é uma página MOOC
    AddinMooc_CONFIG.log(0, 'LOG_PAGE_NOMOOC');
    return;
  }
  
  // inicializa
  if (_fullPath === '') {// caminho do item raiz igual à base
    _fullPath = _base;
  }
  AddinMooc_CONFIG.log(0, 'LOG_INDEX', _indexTitle, _base);
  _index = MoocIndex(_indexTitle, _base);
  if (_indexSection !== '') {// usa item atual se não for o raiz
    _index.useItem(_indexSection, _fullPath);
  }
  discussion = Discussion();
  
  // carrega a navegação do item
  nItemNav.children('.section-link-wrapper').click(function() {
    var nSectionLink = $(this);
    var nSection = $('#' + nSectionLink.attr('id').substring(13));
    if (nSection.hasClass('collapsed')) {
      expand(nSection);
    }
    scrollIntoView(nSection);
    return false;
  });
  nItemNav.toggle(true);

  collapse($('#script'));
  //expande seção ativa
  hashChanged(window.location.hash);
  //seção de reparo para a duração da seção de animação de expansão
  if (window.location.hash !== '') {
    var section = $(window.location.hash);
    fixView(section, 600);
  }
  
  /**
   * prepara cabeçalhos
   * * esconde botões de ação in/out ao entrar na seção
   */
  $('.section > .header').each(function() {
    var nHeader = $(this);
    var nSection = nHeader.parent();
    nHeader.click(function(e) {
      var target = $(e.target);
      if (!target.is('.header', ':header') && target.parents(':header').length === 0) {// Cliques de filtro em botões de ação
        return true;
      }
      if (nSection.hasClass('collapsed')) {
        expand(nSection);
      } else {
        collapse(nSection);
      }
      return false;
    });
    var nActions = nHeader.find('.actions');
    var nActionButtons = nActions.children().not('.modal-box');
    nActionButtons.each(function() {//remove links de imagens de botões de ação
      var btn = $(this);
      var img = btn.find('img');
      btn.append(img).find('a').remove();
    });
    nSection.mouseenter(function() {
      nActionButtons.stop().fadeIn();
    });
    nSection.mouseleave(function() {
      nActionButtons.stop().fadeOut();
    });
  });
  
  /**
   * carrega sobreposições
   * * esconde sobreposições in/out quando o mouse entra/sai da página principal
   */
  $('.overlay').parent().mouseenter(function() {
    var overlay = $(this).children('.overlay');
    if (overlay.css('display') === 'none') {
      overlay.stop().toggle('fast');
    }
  });
  $('.overlay').parent().mouseleave(function() {
    var overlay = $(this).children('.overlay');
    if (overlay.css('display') !== 'none') {
      overlay.stop().toggle('fast');
    }
  });
  
  /**
   * prepara unidades descendentes
   * * esconde estatísticas de discussão in/out quando o mouse entra/sai da página principal
   * * obtém URL do vídeo
   */
  var unitButtons = [];
  var videoTitles = [];
  $('.children .unit').not('#addUnit').not('#addLesson').not('#addMooc').each(function() {
    var nChild = $(this);
    var nIconBar = nChild.find('.icon-bar');
    var nIconBarItems = nIconBar.find('li').not('.disabled');
    var iconBarOpacity = nIconBarItems.css('opacity');
    var nDownloadButton = nIconBar.find('li').eq(1);
    if (nDownloadButton.length > 0 && !nDownloadButton.hasClass('disabled')) {
      unitButtons.push(nDownloadButton);
      videoTitles.push(nDownloadButton.children('a').attr('href').substring(6).replace(/_/g, ' '));
    }
    var nDisStatisticWrapper = nChild.find('.discussion-statistic-wrapper');
    var nDisStat = nDisStatisticWrapper.children('.discussion-statistic');
    var url = nChild.children('.content').children('.title').find('a').attr('href');
    nChild.mouseenter(function() {// mostra estatísticas de discussão quando o mouse entra na página descendente
      nDisStatisticWrapper.stop().fadeIn();
      nIconBarItems.css('opacity', '1');
    });
    nChild.mouseleave(function() {// esconde estatísticas de discussão quando o mouse sai da página descendente
      nDisStatisticWrapper.stop().fadeOut();
      nIconBarItems.css('opacity', iconBarOpacity);
    });
    nChild.click(function() {// item click (pode atacar elementos subjacentes)
      window.location = url;
      return true;
    });
    nDisStat.click(function() {//click de estatísticas de discussão
      window.location = url + '#discussion';
      return false;
    });
	});
  getVideoUrls(videoTitles, function(videoUrls) {
		for (var i = 0; i < videoTitles.length; ++i) {
			var url = videoUrls[videoTitles[i]];
			if (url) {
				unitButtons[i].children('a').attr('href', url);
			}
		}
	});
  
  // para editar links de texto trabalhando em seções vazias
  $('.empty-section .edit-text').click(function() {
    var section = $(this).parents('.section');
    if (section.length == 1) {
      section.children('.header').find('.btn-edit').click();
    }
  });
  
  /**
   * deixa a navegação do item na borda superior da tela (#1)
   */
  if (nItemNav.length > 0) {
    var itemNavTop = nItemNav.offset().top;
    $(window).scroll(function() {
      var y = $(window).scrollTop();
      var isFixed = nItemNav.hasClass('fixed');
      if (y >= itemNavTop) {
        if (!isFixed) {
          nItemNav.after($('<div>', {
            'id': 'qn-replace',
            'height': nItemNav.height()
          }));
          nItemNav.css('width', nItemNav.outerWidth());
          nItemNav.css('position', 'fixed');
          nItemNav.css('top', 0);
          nItemNav.addClass('fixed');
        }
      } else {
        if (isFixed) {
          nItemNav.css('width', '100%');
          nItemNav.css('position', 'relative');
          nItemNav.css('top', null);
          nItemNav.removeClass('fixed');
          nItemNav.next().remove();
        }
      }
    });
  }
  
  /**
   * deixa a barra de navegação na borda superior direita da tela
   */
  if (sidebar.length > 0) {
    var header = sidebar.find('.header-wrapper');
    var sidebarTop = sidebar.offset().top;
    var marginBottom = 10;
    function fixNavBarHeader(header) {
      header.css('width', header.outerWidth());
      header.css('position', 'fixed');
      header.addClass('fixed');
    }
    function resetNavBarHeader(header) {
      header.removeClass('fixed');
      header.css('position', 'absolute');
      header.css('width', '100%');
    }
    function fixNavBar(navBar) {
      navBar.removeClass('trailing');
      navBar.css('bottom', 'auto');
      navBar.css('position', 'fixed');
      navBar.css('top', 0);
      navBar.addClass('fixed');
    }
    function preventNavBarScrolling(navBar, marginBottom) {
      navBar.removeClass('fixed');
      navBar.css('top', 'auto');
      navBar.css('position', 'fixed');
      navBar.css('bottom', marginBottom);
      navBar.addClass('trailing');
    }
    function resetNavBar(navBar) {
      navBar.removeClass('fixed');
      navBar.removeClass('trailing');
      navBar.css('position', 'relative');
    }
    $(window).scroll(function() {
      var maxY = sidebarTop + sidebar.outerHeight();
      var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      var y = $(this).scrollTop(); 
      var navBarScrolling = !sidebar.hasClass('trailing');
      var navBarFixed = sidebar.hasClass('fixed');
      var headerFixed = header.hasClass('fixed');
      if (y >= sidebarTop) {// Barra de navegação na borda da tela superior
        if (sidebar.outerHeight() <= h - marginBottom) {// Adequa a barra de navegação na janela
          if (!navBarFixed) {
            fixNavBar(sidebar);
          }
        } else {// barra de navegação muito larga
          if (!headerFixed) { // corrige cabeçalho de navegação
            fixNavBarHeader(header);
          }
          if (y + h >= maxY + marginBottom) {// desabilita a rolagem quando o fundo de navegação for atingido
            if (navBarScrolling) {
              preventNavBarScrolling(sidebar, marginBottom);
            }
          } else {// habilita a rolagem se ainda estiver disponível o conteúdo
            if (!navBarScrolling) {
              resetNavBar(sidebar);
            }
          }
        }
      } else {// barra de navegação volta ao seu lugar
        if (headerFixed) {
          resetNavBarHeader(header);
        }
        if (navBarFixed) {
          resetNavBar(sidebar);
        }
      }
    });
  }
  
  /**
   * faz cabeçalhos de seção na borda superior da tela (#2)
   */
  if (AddinMooc_root.length > 0) {
    function setActiveSection(section) {
      var activeSection = $('.section').filter('.active');
      if (activeSection.length > 0) {
        setSectionActive(activeSection, false);
      }
      if (section != null) {
        setSectionActive(section, true);
      } else {
        //history.replaceState(null, null, window.location.pathname);
      }
    }
    function setSectionActive(section, isActive) {
      var sectionId = section.attr('id');
      var sectionAnchor = nItemNav.find('#section-link-' + sectionId);
      if (isActive) {
        sectionAnchor.addClass('active');
        section.addClass('active');
        //history.replaceState({}, '', '#' + sectionId);
      } else {
        sectionAnchor.removeClass('active');
        section.removeClass('active');
        resetHeader(section.children('.header'));
      }
    }
    function fixHeader(header, top) {
      header.css('position', 'fixed');
      header.css('top', top);
      header.css('width', header.parent().width());
      header.removeClass('trailing');
      header.addClass('fixed');
    }
    function resetHeader(header) {
      if (header.hasClass('fixed')) {
        header.css('position', 'absolute');
        header.css('width', '100%');
        header.removeClass('fixed');
      }
      header.css('top', 0);
      header.removeClass('trailing');
    }
    function trailHeader(header) {
      if (header.hasClass('fixed')) {
        header.css('position', 'absolute');
        header.css('width', '100%');
        header.removeClass('fixed');
      }
      header.css('top', header.parent().height() - header.outerHeight());
      header.addClass('trailing');
    }
    $(window).scroll(function() {
      var y = $(window).scrollTop();
      var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      var marginTop = 0;
      if (nItemNav.hasClass('fixed')) {// posição de rolagem correta
        marginTop = nItemNav.outerHeight() - 1;
        y += marginTop;
      }
      var activeSection = null;
      $('.section').each(function() {
        var section = $(this);
        var sectionHeader = section.children('.header');
        var sectionTop = section.offset().top;
        var sectionHeight = section.height();
        var isActive = section.hasClass('active');
        var isFixed = sectionHeader.hasClass('fixed');

        if (y >= sectionTop && y <= sectionTop + sectionHeight) {// seção ativa
          if (!isActive) {
            setActiveSection(section);
          }
          activeSection = section;
          if (y <= sectionTop + sectionHeight - sectionHeader.outerHeight()) {// cabeçalho pode ser fixado
            if (!isFixed) {
              fixHeader(sectionHeader, marginTop);
            }
          } else {// cabeçalho no fundo da seção 
            if (!sectionHeader.hasClass('trailing')) {
              trailHeader(sectionHeader);
            }
          }
        } else {
          if (isActive) {
            resetHeader(sectionHeader);
          }
        }
      });
      if (activeSection == null) {
        setActiveSection(null);
      }
    });
  }
  
  // caixas modais
  prepareModalBoxes();
  // preenche caixas modais quando o item é carregado
  _index.retrieveItem(function(item) {
    fillModalBoxes(item);
  });
  
  // torna clicáveis os botões de edição
  var showModalBox = function() {
    var btn = $(this);
    var modal = btn.next('.modal-box');
    if (modal.length == 0) {
      modal = btn.next().next('.modal-box');
    }
    var header = modal.parent().parent();
    nItemNav.css('z-index', 1);
    header.css('z-index', 2);
    // Mostra caixa modal com foco no campo de edição
    var editField = modal.find('fieldset').children('textarea');
    modal.toggle('fast', function() {
      editField.focus();
    });
    return false;
  };
  $('.btn-edit').each(function() {
    var btn = $(this);
    btn.click(showModalBox);
  });
  
  // torna adicionar unidade clicável
  var divAddUnit = $('#addUnit');
  var imgAddUnit = divAddUnit.find('img');
  divAddUnit.find('span').append(imgAddUnit).children('a.image').remove();
  divAddUnit.click(showModalBox);
  divAddUnit.show();
  // torna adicionar lição clicável
  var divAddLesson = $('#addLesson');
  var imgAddLesson = divAddLesson.find('img');
  divAddLesson.find('span').append(imgAddLesson).children('a.image').remove();
  divAddLesson.click(showModalBox);
  divAddLesson.show();
  // torna adicionar MOOC clicável
  var divAddMooc = $('#addMooc');
  var imgAddMooc = divAddMooc.find('img');
  divAddMooc.find('span').append(imgAddMooc).children('a').remove();
  divAddMooc.click(showModalBox);
  
  //cria páginas de invocação
  var invokeItem = Item(Header(0, null, null, null), _index);
  $('#navigation a.new').click(function() {
    var link = $(this);
    var itemUrl = link.attr('href').replace(/_/g, ' ');
    itemUrl = itemUrl.substring(0, itemUrl.length - 22);
    var itemTitle = itemUrl.substring(19);
    createPage(itemTitle, invokeItem.getInvokeCode(), 'página invocada por item Mooc criada', function() {// browse to created page
      window.location.href = itemUrl;
    });
    return false;
  });
  
  // coloca discussão na interface de usuário se não for uma raiz MOOC
  if (_fullPath != _base) {
    var talkPageTitle = getTalkPageTitle(_fullPath);
    var scriptTalkPage = talkPageTitle + '/script';
    var quizTalkPage = talkPageTitle + '/quiz';
    renderThreads([
      talkPageTitle, scriptTalkPage, quizTalkPage
    ]);
  }
});

//DEBUG END
});

/*####################
  # UTILIDADES DA INTERFACE DE USUÁRIO
  # funções de auxílio para mudar a interface de usuário
  ####################*/

/**
 * Handler para evento onHashChange. Expande a seção navegada via âncora.
 * @param {String} anchor ("hash") value
 */
function hashChanged(hash) {
  if (hash.length > 0) {
    var section = $(hash);
    if (section.hasClass('collapsed')) {
      expand(section);
    }
  }
}

/**
 * Recarrega a página atual.
 * @param {String} (optional) página âncora a ser carregada
 */
function reloadPage(anchor) {
  if (typeof anchor === 'undefined') {
    document.location.search = document.location.search + '&action=purge';
  } else {
    window.location.href = document.URL.replace(/#.*$/, '') + '?action=purge' + anchor;
  }
}
 
/**
 * Mostra uma mensagem de notificação ao usuário.
 * Usa mw.Message para gerar mensagens.
 * @param {String} chave da mensagem
 * @param {Array} parâmetros da mensagem
 */
function notifyUser(msgKey, msgParams) {
	var msgValue = mw.msg(msgKey, msgParams);
	alert(msgValue);
}


/**
 * Colapsa uma seção para uma altura fixa que pode ser configurada. A seção é então expansível novamente.
 * Aplica-se apenas a seções não colapsadas que são maiores do que a interface de usuário colapsada seria.
 * @param {jQuery} nó da seção a ser colapsada
 */
function collapse(section) {
  var content = section.children('.content');
  if (section.hasClass('collapsed') || content.height() <= 80) {
    return;
  }
  section.addClass('collapsed');
  var btnReadMore = $('<div>', {
    'class': 'btn-expand'
  }).html(AddinMooc_CONFIG.message('UI_SECTION_BTN_EXPAND'));
  btnReadMore.click(function() {
    expand(section);
    return false;
  });// expandível através do botão clicar
  section.append(btnReadMore);
  section.on('click', function() {
    expand(section);
    return true;
  });// expandível através do botão clicar (pode atacar elementos subjacentes)
  section.focusin(function() {
    expand(section);
    return true;
  });// expansível através da focagem de qualquer elemento descendente (pode atacar elementos subjacentes)
  var btnHeight = btnReadMore.css('height');
  btnReadMore.css('height', '0');
  btnReadMore.stop().animate({
    'height': btnHeight
  }, function() {
    btnReadMore.css('height', null);
  });
  content.stop().animate({
    'height': AddinMooc_CONFIG.get('UI_SECTION_COLLAPSED_HEIGHT') + 'px'
  }, 'slow');
}

/**
 * Expande uma seção até sua altura completa, tornando-a novamente dobrável.
 * @param {jQuery} nó da seção a ser expandido
 */
function expand(section) {
  section.removeClass('collapsed');
  var content = section.children('.content');
  var crrHeight = content.css('height');
  var targetHeight = content.css('height', 'auto').height();
  section.children('.btn-expand').stop().animate({
    'height': '0'
  }, 'slow', function() {
    $(this).remove();
  });
  section.off('click');
  content.css('height', crrHeight);
  content.stop().animate({
    'height': targetHeight
  }, 'slow', function() {
    content.css('height', 'auto');
  });
}

/**
 * Colapsa um segmento para combinar um número fixo de caracteres que podem ser configurados. A discussão é então expansível novamente.
 * @param {jQuery} nó do tópico a ser colapsado
 * @param {Object} tópico mostrado pelo nó
 */
function collapseThread(nThread, thread) {
  var content = nThread.children('.content');
  var nMessage = content.children('.message');
  var nMessageText = nMessage.children('.text');
  var nReplies = content.children('.replies');
  if (nThread.hasClass('collapsed') || (nMessageText.text().length < 100 && nReplies.children().length < 2 && content.height() <= 120)) {
    return;
  }
  var collapsedText = cutThreadContent(thread, AddinMooc_CONFIG.get('UI_THREAD_COLLAPSED_NUMCHARACTERS'));
  nMessageText.html(collapsedText);
  var targetHeight = nMessage.outerHeight() + 5;
  nMessageText.html(thread.htmlContent);
  nThread.addClass('collapsed');
  var btnReadMore = $('<div>', {
    'class': 'btn-expand'
  }).html(AddinMooc_CONFIG.message('UI_THREAD_BTN_EXPAND'));
  btnReadMore.click(function() {
    expandThread(nThread, thread);
    return false;
  });// expandível através do botão clicar
  nThread.append(btnReadMore);
  nThread.on('click', function() {
    expandThread(nThread, thread);
    return true;
  });// expandível através do botão clicar (pode atacar elementos subjacentes)
  nThread.focusin(function() {
    expandThread(nThread, thread);
    return true;
  });// expandível através do foco em uma subpágina (pode atacar elementos subjacentes)
  var btnHeight = btnReadMore.css('height');
  btnReadMore.css('height', '0');
  btnReadMore.stop().animate({
    'height': btnHeight
  }, function() {
    btnReadMore.css('height', null);
  });
  content.stop().animate({
    'height': targetHeight + 'px'
  }, 'slow', function() {
    nMessageText.html(collapsedText);
  });
}

/**
 * Expande um fio até sua altura completa tornando-o encapsulável novamente.
 * @param {jQuery} nó do tópico a ser expandido
 * @param {Object} tópico exibido pelo nó
 */
function expandThread(nThread, thread) {
  nThread.removeClass('collapsed');
  var content = nThread.children('.content');
  var nMessageText = content.children('.message').children('.text');
  nMessageText.html(thread.htmlContent);
  var crrHeight = content.css('height');
  var targetHeight = content.css('height', 'auto').height();
  nThread.children('.btn-expand').stop().animate({
    'height': '0'
  }, 'slow', function() {
    $(this).remove();
  });
  nThread.off('click');
  content.css('height', crrHeight);
  content.stop().animate({
    'height': targetHeight
  }, 'slow', function() {
    content.css('height', 'auto');
  });
}

/**
 * Corrige uma exibição na borda superior da tela através do bloqueio de rolagem.
 * @param {jQuery} elemento a ser fixado
 * @param {int} duração do bloqueio de rolagem
 */
function fixView(element, duration) {
  if (duration > 0) {
    element.css('background-color', '#FFF');
    var width = element.width();
    element.css('position', 'fixed');
    element.css('width', width);
    element.css('top', '0');
    var zIndex = element.css('z-index');
    element.css('z-index', 100);
    setTimeout(function() {
      element.css('position', 'relative');
      element.css('top', null);
      element.css('z-index', zIndex);
      window.scroll(0, element.offset().top);
      $(window).scroll();
    }, duration);
  }
}

/**
 * Desliza um elemento para a visualização do usuário.
 * A posição final de rolagem pode lidar com o movimento do elemento, a animação não.
 * @param {jQuery} elemento a ser deslizado para a visualização
 * @param {String} 'top'/'bottom' se o elemento deve estar alinhado à borda superior/inferior. Padrão "topo"
 * @param {int} (optional) duração da animaço de rolagem. Padrão 1000ms
 */
function scrollIntoView(element, align, duration) {
  if (typeof duration === 'undefined') {
    duration = 1000;
  }
  var Alignment = {
    'TOP': 1,
    'BOTTOM': 2
  };
  if (align === 'bottom') {
    align = Alignment.BOTTOM;
  } else {
    align = Alignment.TOP;
  }
  var targetTop;
  var adjustAnimation = function(now, fx) {
    var h = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
    var y = $(window).scrollTop();
    var crrTop = element.offset().top;
    if (align === Alignment.BOTTOM) {
      crrTop += element.height() - h;

      if (crrTop + h - y < h) {// elemento já em vista
        crrTop = y;
        fx.end = y;
        return true;
      }
    } else {
      
    }
    if (nItemNav !== 'undefined' && nItemNav.hasClass('fixed')) {
      crrTop -= nItemNav.height();
    }
    if (targetTop != crrTop) {
      targetTop = crrTop;
      fx.end = targetTop;
    }
    return false;
  };
  if (!adjustAnimation(0, {})) {
    $('html, body').stop().animate({
      scrollTop: targetTop
    }, {
      'duration': duration,
      'step': adjustAnimation
    });
  }
}

/**
 * Prepara todas as caixas modais. Registra todos os eventos de caixa da interface do usuário.
 */
function prepareModalBoxes() {
  // preenche caixas modais para salvar as alterações no item ou nos seus recursos
  prepareModalBox('learningGoals', 'edit', 5, saveChanges);
  prepareModalBox('video', 'edit', 1, saveChanges);
  prepareModalBox('script', 'edit', 5, saveChanges);
  prepareModalBox('quiz', 'edit', 5, saveChanges);
  prepareModalBox('furtherReading', 'edit', 5, saveChanges);

  // preenche caixas modais para adicionar um item MOOC
  prepareModalBox('addLesson', 'add-lesson', 1, function(idSection, value, summary) {
    addLesson(value, _index.item, summary, function() {
      reloadPage();
    });
  });
  prepareModalBox('addUnit', 'add-unit', 1, function(idSection, value, summary) {
    addUnit(value, _index.item, summary, function() {
      reloadPage();
    });
  });
  prepareModalBox('createMooc', 'create-mooc', 1, function(idSection, value, summary) {
    createMooc(value, summary, function() {
      reloadPage();
    });
  }).find('.btn-save').prop('disabled', false);

  // faz caixas modais fechavéis através de botão
  $('.modal-box').each(function() {
    var modal = $(this);
    modal.find('.btn-close').click(function() {
      closeModalBox(modal);
      return false;
    });
  });
  // faz caixas modais fecháveis por meio de clique no plano de fundo
  $('.modal-box > .background').click(function(e) {
    closeModalBox($(e.target).parent());
    return false;
  });
  // faz caixas modais fecháveis pelo ESC
  $('.modal-box').on('keydown', function(e) { 
    if (e.which == 27) {
      closeModalBox($(this));
    }
  });
}

/**
 * Cria uma caixa modal.
 * @param {String} identificador do parâmetro/recurso pelo qual a caixa modal é responsável
 * @param {String} identificador da caixa (adicionar/editar)
 * @param {int} número de linhas necessárias para editar
 * @param {function} onSave retorno de chamada
 * @return {jQuery} nó da caixa modal criada
 */
function prepareModalBox(idSection, intentType, numLines, finishCallback) {
  // cria a estrutura da caixa modal
  var modalBox = $('#modal-' + intentType + '-' + idSection);
  modalBox.append($('<div>', {
    'class': 'background'
  }));
  var boxContent = $('<div>', {
    'class': 'content border-box'
  });
  boxContent.append($('<div>', {
    'class': 'btn-close'
  }));
  var editFieldset = $('<fieldset>', {
    'class': 'edit-field'
  });
  // rótulo e texto para valor
  editFieldset.append($('<label>', {
    'for': 'edit-field-' + idSection,
    'class': 'label-title',
    'text': AddinMooc_CONFIG.message('UI_MODAL_LABEL_TITLE_' + idSection)
  }));
  var editField;
  if (numLines > 1) {
    editField = $('<textarea>', {
      'class': 'border-box',
      'id': 'edit-field-' + idSection
    });
  } else {
    editField = $('<input>', {
      'class': 'border-box',
      'id': 'edit-field-' + idSection,
      'type': 'text'
    });
  }
  editFieldset.append(editField);
  // rótulo e label e caixa de entrada para sumário de edição
  editFieldset.append($('<label>', {
    'for': 'summary-' + idSection,
    'class': 'label-summary',
    'text': AddinMooc_CONFIG.message('UI_MODAL_LABEL_SUMMARY')
  }));
  var ibSummary = $('<input>', {
    'id': 'summary-' + idSection,
    'class': 'border-box summary',
    'type': 'text'
  });
  editFieldset.append(ibSummary);
  // texto de ajuda
  var divHelpText = $('<div>', {
    'class': 'help'
  }).html(AddinMooc_CONFIG.message('UI_MODAL_HELP_' + idSection, _fullPath));
  editFieldset.append(divHelpText);
  boxContent.append(editFieldset);

  // boto de finalização
  var btnSave = $('<input>', {
    'class': 'btn-save',
    'disabled': true,
    'type': 'button',
    'value': AddinMooc_CONFIG.message('UI_MODAL_BTN_' + intentType)
  });
  boxContent.append(btnSave);
  btnSave.click(function() {
    if (!btnSave.prop('disabled')) {
      btnSave.prop('disabled', true);
      finishCallback(idSection, editField.val(), ibSummary.val());
    }
    return false;
  });
  modalBox.append(boxContent);
  return modalBox;
}

/**
 * Preenche todas as caixas modais. 
 * @param {Object} item MOOC que a caixa modal irá permitir editar 
 */
function fillModalBoxes(item) {
  // injeta dados do item
  $('#edit-field-learningGoals').append(item.getParameter(PARAMETER_KEY.LEARNING_GOALS));
  $('#modal-edit-learningGoals').find('.btn-save').prop('disabled', false);
  $('#edit-field-video').val(item.getParameter(PARAMETER_KEY.VIDEO));
  $('#modal-edit-video').find('.btn-save').prop('disabled', false);
  $('#edit-field-furtherReading').append(item.getParameter(PARAMETER_KEY.FURTHER_READING));
  $('#modal-edit-furtherReading').find('.btn-save').prop('disabled', false);
  $('#modal-add-lesson-addLesson').find('.btn-save').prop('disabled', false);
  $('#modal-add-unit-addUnit').find('.btn-save').prop('disabled', false);

  // recupera e injeta recursos adicionais
  var taScript = $('#edit-field-script');
  item.retrieveScript(function(scriptText) {
    taScript.text(scriptText).html();
    $('#modal-edit-script').find('.btn-save').prop('disabled', false);
  }, function(jqXHR) {
    if (jqXHR.status == 404) {// roteiro faltando
      taScript.text(AddinMooc_CONFIG.message('DEFVAL_SCRIPT', item.header.type)).html();
    }
    $('#modal-edit-script').find('.btn-save').prop('disabled', false);
  });
  var taQuiz = $('#edit-field-quiz');
  item.retrieveQuiz(function(quizText) {
    taQuiz.text(quizText).html();
    $('#modal-edit-quiz').find('.btn-save').prop('disabled', false);
  }, function(jqXHR) {
    if (jqXHR.status == 404) {// quiz faltando
      taQuiz.text(AddinMooc_CONFIG.message('DEFVAL_QUIZ')).html();
      $('#modal-edit-quiz').find('.btn-save').prop('disabled', false);
    }
  });
}

/**
 * Fecha uma caixa modal.
 * @param {jQuery} caixa modal a ser fechada
 */
function closeModalBox(modal) {
  nItemNav.css('z-index', 1001);
  modal.parent().parent().css('z-index', 1);
  modal.fadeOut();
}

/**
 * Salva a alteraração em um item ou em um recurso desse item. Atualiza o index do MOOC.
 * @param {String} identificador do parâmetro ou recurso
 * @param {String} valor de seção
 * @param {String} edita apêndice de resumo
 */
function saveChanges(idSection, value, summary) {
  var sucCallback = function() {
    reloadPage('#' + idSection);
  };
  if (idSection === 'script') {// atualiza o recurso do roteiro
    //if (_index.item.script === null) {
      // adiciona categoria
      //value += '\n<noinclude>[[category:' + _index.base + '-MOOC]]</noinclude>';
    //}
    updateScript(_index.item, value, summary, sucCallback);
  } else if (idSection === 'quiz') {// atualiza o recurso de quiz
    //if (_index.item.quiz === null) {
      // add category
      //value += '\n<noinclude>[[category:' + _index.base + '-MOOC]][[category:Quizzes]]</noinclude>';
    //}
    updateQuiz(_index.item, value, summary, sucCallback);
  } else {// atualiza parâmetros de índice
    var key = null;
    if (idSection === 'learningGoals') {
      key = PARAMETER_KEY.LEARNING_GOALS;
      value = value.replace(/(^|\n)\*/g, '\n#');
    } else if (idSection === 'video') {
      key =  PARAMETER_KEY.VIDEO;
      value = value.replace(/(^|\n)\*/g, '');
    } else if (idSection === 'furtherReading') {
      key = PARAMETER_KEY.FURTHER_READING;
      value = value.replace(/(^|\n)\*/g, '\n#');
    }
    if (key !== null) {
      if (summary === '') {
        summary = AddinMooc_CONFIG.message('DEFSUM_EDIT_' + idSection);
      }
      _index.item.setParameter(key, value);
      updateIndex(_index.item, summary, sucCallback);
    }
  }
}

/**
 * Injeta a interface para fazer uma pergunta em uma seção.
 * @param {String} identificador de seção
 * @param {String} título da página de discussão onde uma questão será colocada
 * @param {boolean} injeta um botão apensa no cabeçalho de uma seção se true
 */
function insertAskQuestionUI(identifier, talkPageTitle, ownUi) {
  var nSection = $('#' + identifier);
  var nContent = nSection.children('.content');
  var btn = nSection.children('.header').find('.btn-ask-question');
  if (ownUi) {// cria interface de usuário
    var ui = createAskQuestionUI(identifier, talkPageTitle);
    nContent.append(ui);
    btn.click(function() {
      // desliza para a interface de usuário e foca no título da caixa
      scrollIntoView(ui, 'bottom');
      ui.children('.title').focus();
    });
  } else {// desliza para a interface de usuário de discussão
    btn.click(function() {
      var nDiscussionUi = $('#discussion').find('.ask-question');
      scrollIntoView(nDiscussionUi, 'bottom');
      nDiscussionUi.children('.title').focus();
    });
  }
}


/**
 * Cria a interface para fazer uma pergunta.
 * @param {String} identificador do parâmetro/recurso onde a interface pertence
 * @param {String} título da página de discussão onde a questão será colocada
 * @return {jQuery} nó da interface criada
 */
function createAskQuestionUI(identifier, talkPageTitle) {
  var ui = $('<div>', {
    'class': 'ask-question'
  });
  // título da questão
  var lbTitle = $('<label>', {
    'for': 'thread-title-' + identifier,
    'text': AddinMooc_CONFIG.message('UI_ASK_LABEL_TITLE')
  });
  ui.append(lbTitle);
  var iTitle = $('<input>', {
    'class': 'title border-box',
    'id': 'thread-title-' + identifier,
    'type': 'text'
  });
  ui.append(iTitle);
  // conteúdo da questão
  var lbContent = $('<label>', {
    'for': 'thread-content-' + identifier,
    'text': AddinMooc_CONFIG.message('UI_ASK_LABEL_CONTENT')
  });
  ui.append(lbContent);
  var minRows = 3;
  var teaContent = $('<textarea>', {
    'class': 'border-box',
    'id': 'thread-content-' + identifier,
    'rows': minRows
  });
  ui.append(teaContent);
  $(document).on('input.textarea', '#' + teaContent.attr('id'), function() {
    var rows = this.value.split('\n').length;
    this.rows = rows < minRows ? minRows : rows;
  });
  // botão para fazer uma pergunta
  var btnAsk = $('<input>', {
    'class': 'btn-ask',
    'type': 'button',
    'value': AddinMooc_CONFIG.message('UI_ASK_BTN_ASK')
  });
  ui.append(btnAsk);
  btnAsk.click(function() {
    if (btnAsk.prop('disabled')) {
      return;
    }
    btnAsk.prop('disabled', true);
    // adiciona uma seção à página de discussão
    var title = iTitle.val();
    if (title.length > 0) {
      var content = stripPost(teaContent.val());
      content += ' --~~~~';
      asking = true;
      _index.retrieveItem(function(item) {
        item.discussion = discussion;
        addThread(item, getTalkPage(talkPageTitle), title, content, function() {
          reloadPage('#discussion');
        });
      });
    } else {
      notifyUser('q-no-title', null, {
        'class': 'error'
      });
    }
  });
  var blackIn = function() {
    ui.css('opacity', 1);
  };
  var greyOut = function() {
    if (ui.children(':focus').length > 0) {// não cinza se estiver focado
      return;
    }
    ui.css('opacity', 0.6);
  };
  ui.mouseleave(greyOut);
  ui.focusout(greyOut);
  greyOut();
  ui.mouseenter(blackIn);
  ui.focusin(blackIn);
  return ui;
}

/**
 * Cria a interface para responder um post. 
 * @param {Object} objeto postData incluindo tópico raiz e post para responder a ele
 * @return {jQuery} nó da interface criada
 */
function createReplyUI(postData) {
  var ui = $('<div>', {
    'class': 'ui-reply'
  });
  // conteúdo de resposta
  var lbContent = $('<label>', {
    'for': 'reply-content-' + postData.post.id,
    'text': AddinMooc_CONFIG.message('UI_REPLY_LABEL_CONTENT')
  });
  ui.append(lbContent);
  var minRows = 3;
  var teaContent = $('<textarea>', {
    'class': 'border-box',
    'id': 'reply-content-' + postData.post.id,
    'rows': minRows
  });
  ui.append(teaContent);
  $(document).on('input.textarea', '#' + teaContent.attr('id'), function() {
    var rows = this.value.split('\n').length;
    this.rows = rows < minRows ? minRows : rows;
  });
  // botão para responder
  var btnReply = $('<input>', {
    'class': 'btn-reply',
    'type': 'button',
    'value': 'Send reply'
  });
  btnReply.click(function() {
    if (btnReply.prop('disabled')) {
      return;
    }
    btnReply.prop('disabled', true);
    var content = stripPost(teaContent.val());
    if (content.length > 0) {
      var post = postData.post;
      var thread = postData.thread;
      var reply = Post(0, post.level + 1, [ content ], [], createPseudoSignature('--~~~~'));
      post.replies.push(reply);
      // salva tópico na página de discussão dele
      _index.retrieveItem(function(item) {
        item.discussion = discussion;
        saveThread(item, thread, function() {
          reloadPage('#discussion');
        });
      });
    }
  });
  ui.append(btnReply);
  return ui;
}

/**
 * Renderiza um post em um nó.
 * @param {Object} instância post instance a ser renderizada
 * @return {jQuery} nó representando o post dado
 */
function renderPost(post) {
  // nó principal
  var nPost = $('<li>', {
    'class': 'post',
    'id': 'post-' + post.id
  });
  // conteúdo
  var nContent = $('<div>', {
    'class': 'content'
  });
  // mensagem do post
  var nMessage = $('<div>', {
    'class': 'message'
  });
  // texto da mensagem
  var nMessageText = $('<div>', {
  'class': 'text'
  }).html(post.htmlContent);
  nMessage.append(nMessageText);
  // meta informação
  var sSignature = '';
  if (post.signature !== null) {
    sSignature = post.signature.tostring();
  }
  var nMeta = $('<div>', {
    'class': 'meta',
    'text': sSignature
  });
  nMeta.toggle(false);
  nMessage.append(nMeta);
  // sobreposição de respostas
  var nOverlay = renderPostOverlay();
  nMessage.prepend(nOverlay);
  nMessage.mouseenter(function() {
    nOverlay.stop(true).fadeIn();
    nMeta.stop(true).fadeIn();
  });
  nMessage.mouseleave(function() {
    nOverlay.stop(true).fadeOut();
    nMeta.stop(true).fadeOut();
  });
  nContent.append(nMessage);
  // respostas
  nContent.append(renderReplies(post));
  nPost.append(nContent);
  return nPost;
}

/**
 * Cria a sobreposição para mostrar a interface de resposta.
 * @return {jQuery} nó da sobreposição criada
 */
function renderPostOverlay() {
  var nOverlay = $('<div>', {
    'class': 'overlay'
  });
  var nBackground = $('<div>', {
    'class': 'background'
  });
  var nContent = $('<div>', {
    'class': 'content'
  });
  var btnReply = $('<div>', {
    'class': 'btn-reply',
    'text': AddinMooc_CONFIG.message('UI_REPLY_BTN_REPLY')
  });
  var ui = null;
  btnReply.click(function() {// injeta interface para responder um post
    var visible = false;
    if (ui === null) {
      var nPost = nOverlay.parent().parent().parent();
      var postId = nPost.attr('id').substring(5);
      var postData = findPostInThread(postId);
      ui = createReplyUI(postData);
      nPost.children('.content').children('.replies').append(ui);
    } else {
      visible = ui.css('display') != 'none';
      ui.toggle('fast');
    }
    if (!visible) {
      // esconte todas as outras interfaces para fazer uma pergunta
      $('.ui-reply').not(ui).toggle(false);
      // desliza para a interface de usuário
      scrollIntoView(ui, 'bottom');
      ui.children('textarea').focus();
    }
  });
  nContent.append(btnReply);
  nOverlay.append(nBackground);
  nOverlay.append(nContent);
  return nOverlay;
}

/**
 * Renderiza as respostas de um post. 
 * @param {Object} post com respostas a ser renderizado
 * @return {jQuery} nó com todos os posts de resposta renderizados
 */
function renderReplies(post) {
  var nReplies = $('<ol>', {
    'class': 'replies'
  });
  for (var i = 0; i < post.replies.length; ++i) {
    nReplies.append(renderReply(post.replies[i]));
  }
  return nReplies;
}

/**
 * Renderiza um post de resposta em um nó.
 * @param {Object} instância post a ser renderizado
 * @return {jQuery} nó representando o post de resposta dado
 */
function renderReply(reply) {
  var nReply = renderPost(reply);
  nReply.addClass('reply');
  return nReply;
}

/**
 * Renderiza um tópico em um nó.
 * @param {Object} instância de tópico a ser renderizado
 * @return {jQuery} nó representando o tópico dado
 */
function renderThread(thread) {
  var nThread = renderPost(thread);
  nThread.addClass('thread');
  // adiciona cabeçalho do tópico contendo título e estatísticas
  var nHeader = renderThreadHeader(thread);
  nThread.prepend(nHeader);
  // torna o tópico desmontável
  nThread.children('.content').addClass('collapsible');
  nHeader.click(function() {
    if (nThread.hasClass('collapsed')) {
      expandThread(nThread, thread);
    } else {
      collapseThread(nThread, thread);
    }
  return false;
  });
  // mostra atenção se não estiver assinado
  if (thread.signature === null) {
    nThread.find('.meta').addClass('warning').text('No one signed this thread.');
  }
  return nThread;
}

/**
 * Cria o cabeçalho de um certo tópico.
 * @param {Object} instância de tópico para criar um cabeçalho para ele 
 * @return {jQuery} nó de cabeçalho criado
 */
function renderThreadHeader(thread) {
  // título do tópico
  var nHeader = $('<h2>', {
    'class': 'header title',
    'text': thread.title
  });
  // número de respostas
  var nNumReplies = $('<div>', {
    'class': 'num-replies',
    'text': AddinMooc_CONFIG.message('UI_THREAD_LABEL_HEADER', thread.getNumPosts() - 1)
  });
  nHeader.append(nNumReplies);
  return nHeader;
}

/*####################
  # MEDIAWIKI API WRAPPERS
  # as funções têm diferentes funções e
  # 1.) resumo de chamadas de API
  # 2.) múltiplas chamadas sucessivas
  ####################*/

/**
 * Request a wiki page's plain wikitext content.
 * Uses 'action=raw' to get the page content.
 * @param {String} title of the wiki page
 * @param {int} section within the wiki page; pass 0 to retrieve whole page
 * @param {function} success callback (String pageContent)
 * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
 */
function doPageContentRequest(pageTitle, section, sucCallback, errorCallback) {/* Q: feature supported by mw.Api? */
  var url = AddinMooc_CONFIG.get("MW_ROOT_URL") + "?action=raw&title=" + pageTitle;
  if (section !== null) {
    url += "&section=" + section;
  }
  $.ajax({
    url: url,
    cache: false
  }).fail(function(jqXHR) {
    AddinMooc_CONFIG.log(1, 'ERR_WCONTENT_REQ', pageTitle, section, jqXHR.status);
    if (typeof errorCallback !== 'undefined') {
      errorCallback(jqXHR);
    }
  }).done(sucCallback);
}

/**
 * Retrieves edit tokens for any number of wiki pages.
 * @param {Array<String>} page titles of the wiki pages
 * @param {function} success callback (Object editTokens: editTokens.get(pageTitle) = token)
 */
function doEditTokenRequest(pageTitles, sucCallback) {
  var sPageTitles = pageTitles.join('|');
  // get edit tokens
  var tokenData = {
    'intoken': 'edit|watch'
  };
  $.ajax({
    type: "POST",
    url: AddinMooc_CONFIG.get("MW_API_URL") + "?action=query&prop=info&format=json&titles=" + sPageTitles,
    data: tokenData
  }).fail(function(jqXHR) {
    AddinMooc_CONFIG.log(1, 'ERR_WTOKEN_REQ', sPageTitles, jqXHR.status);
  }).done(function(response) {
    var editTokens = parseEditTokens(response);
    if (editTokens.hasTokens()) {
      sucCallback(editTokens);
    } else {
      AddinMooc_CONFIG.log(1, 'ERR_WTOKEN_MISSING', sPageTitles, JSON.stringify(response));
    }
  });
}

/**
 * Edits a wiki page. (non-existing pages will be created automatically)
 * @param {String} title of the wiki page
 * @param {int} section within the wiki page; pass 0 to edit whole page
 * @param {String} edited page content
 * @param {String} edit summary
 * @param {function} success callback
 */
function doEditRequest(pageTitle, section, content, summary, sucCallback) {/* Q: what errors are possible? */
  AddinMooc_CONFIG.log(0, 'LOG_WEDIT', pageTitle, section);
  doEditTokenRequest([ pageTitle ], function(editTokens) {
    var editToken = editTokens.get(pageTitle);
    var editData = {
      'title': pageTitle,
      'text': content,
      'summary': summary,
      'watchlist': 'watch',
      'token': editToken
    };
    if (section !== null) {
      editData.section = section;
    }
    $.ajax({
      type: "POST",
      url: AddinMooc_CONFIG.get("MW_API_URL") + "?action=edit&format=json",
      data: editData
    }).fail(function(jqXHR) {
      AddinMooc_CONFIG.log(1, 'ERR_WEDIT_REQ', pageTitle, jqXHR.status);
    }).done(function(response) {//TODO handle errors
      AddinMooc_CONFIG.log(0, 'LOG_WEDIT_RES', JSON.stringify(response));
      sucCallback();
    });
  });
}

/**
 * Adds a section to a wiki page. (non-existing pages will be created automatically)
 * @param {String} title of the wiki page
 * @param {String} title of the new section
 * @param {String} content of the new section
 * @param {String} edit summary
 * @param {function} success callback
 */
function addSectionToPage(pageTitle, sectionTitle, content, summary, sucCallback) {
  AddinMooc_CONFIG.log(0, 'LOG_WADD', pageTitle, sectionTitle);
  doEditTokenRequest([ pageTitle ], function(editTokens) {
    var editToken = editTokens.get(pageTitle);
    var editData = {
      'title': pageTitle,
      'section': 'new',
      'sectiontitle': sectionTitle,
      'text': content,
      'summary': summary,
      'watchlist': 'watch',
      'token': editToken
    }; 
    $.ajax({
      type: "POST",
      url: AddinMooc_CONFIG.get("MW_API_URL") + "?action=edit&format=json",
      data: editData
    }).fail(function(jqXHR) {
      AddinMooc_CONFIG.log(1, 'ERR_WADD_REQ', pageTitle, sectionTitle, jqXHR.status);
    }).done(function(response) {//TODO handle errors
      AddinMooc_CONFIG.log(0, 'LOG_WADD_RES', JSON.stringify(response));
      sucCallback();
    });
  });
}

/**
 * Parses a server response containing one or multiple edit tokens.
 * @param {JSON} tokenResponse
 * @return {Object} edit tokens object - you can retrieve the edit token by passing the page title to the object's 'get'-function
 */
function parseEditTokens(tokenResponse) {
  var hasTokens = false;
  var editTokens = {
    'tokens': [],
    'add': function(title, edittoken) {
      var lTitle = title.toLowerCase();
      AddinMooc_CONFIG.log(0, 'LOG_WTOKEN_TOKEN', title, edittoken);
      this.tokens[lTitle] = edittoken;
      hasTokens = true;
    },
    'get': function(title) {
      return this.tokens[title.toLowerCase()];
    },
    'hasTokens': function() {
      return hasTokens;
    }
  };
  var path = ['query', 'pages'];
  var crr = tokenResponse;
  for (var i = 0; i < path.length; ++i) {
    if (crr && crr.hasOwnProperty(path[i])) {
      crr = crr[path[i]];
    } else {
      AddinMooc_CONFIG.log(1, 'ERR_WTOKEN_PARSING', path[i]);
      crr = null;
      break;
    }
  }
  if (crr) {
    var pages = crr;
    for (var pageId in pages) {
      // page exists
      if (pages.hasOwnProperty(pageId)) {
        var page = pages[pageId];
        editTokens.add(page.title, page.edittoken);
      }
    }
  }
  return editTokens;
}

/**
 * Retrieves the index of a MOOC.
 * @param {String} title of the MOOC index page
 * @param {int} section within the index page; pass 0 to retrieve whole page
 * @param {function} success callback (String indexContent)
 */ 
function getIndex(title, section, sucCallback) {
  doPageContentRequest(title, section, sucCallback);
}

/**
 * Retrieves the script of a MOOC item.
 * @param {Object} MOOC item
 * @param {function} success callback (String scriptContent)
 * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
 */
function getScript(item, sucCallback, errorCallback) {
  doPageContentRequest(item.fullPath + '/script', 0, sucCallback, errorCallback);
}

/**
 * Retrieves the quiz of a MOOC item.
 * @param {Object} MOOC item
 * @param {function} success callback (String quizContent)
 * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
 */
function getQuiz(item, sucCallback, errorCallback) {
  doPageContentRequest(item.fullPath + '/quiz', 0, sucCallback, errorCallback);
}

/**
 * Updates the script of a MOOC item.
 * @param {Object} MOOC item
 * @param {String} updated script content
 * @param {String} edit summary; uses generated summary if empty
 * @param {function} success callback
 */
function updateScript(item, scriptText, summary, sucCallback) {
  var editSummary = summary;
  if (editSummary === '') {
    editSummary = 'script update for MOOC ' + item.header.type + ' ' + item.fullPath;
  }
  doEditRequest(item.fullPath + '/script', 0, scriptText, editSummary, sucCallback);
}

/**
 * Updates the quiz of a MOOC item.
 * @param {Object} MOOC item
 * @param {String} updated quiz content
 * @param {String} edit summary; uses generated summary if empty
 * @param {function} success callback
 */
function updateQuiz(item, quizText, summary, sucCallback) {
  var editSummary = summary;
  if (editSummary === '') {
    editSummary = 'quiz update for MOOC ' + item.header.type + ' ' + item.fullPath;
  }
  doEditRequest(item.fullPath + '/quiz', 0, quizText, editSummary, sucCallback);
}

/**
 * Updates the MOOC index containing the given MOOC item.
 * @param {Object} MOOC item
 * @param {String} edit summary appendix; will be appended to a generated summary specifying the MOOC item passed
 * @param {function} success callback
 */
function updateIndex(item, summaryAppendix, sucCallback) {
  var summary = item.header.type + ' ' + item.header.path + ': ' + summaryAppendix;
  if (item.header.path === null) {// changing root item
    summary = item.header.type + ':' + summaryAppendix;
  }
  doEditRequest(item.index.title, item.indexSection, item.tostring(), summary, sucCallback);
}

/**
 * Creates a wiki page.
 * @param {String} title of the new page
 * @param {String} content of the new page
 * @param {String} edit summary
 * @param {function} success callback
 */
function createPage(pageTitle, content, summary, sucCallback) {
  doEditRequest(pageTitle, 0, content, summary, sucCallback);
}

/**
 * Adds a child item to a MOOC item.
 * @param {String} type of the new item
 * @param {String} name of the new item
 * @param {Object} MOOC item the child will be added to
 * @param {String} edit summary appendix for MOOC index edit; uses generated summary appendix if empty
 * @param {function} success callback
 */
function addChild(type, name, parent, summary, sucCallback) {
  // add item to parent
  var parentHeader = parent.header;
  var header = Header(parentHeader.level + 1, type, name, null);
  parent.childLines.push(header.tostring());
  AddinMooc_CONFIG.log(0, 'LOG_ADD_CHILD', parentHeader.type, parentHeader.title, header.tostring());
  // update MOOC index at parent position
  var itemIdentifier = type + ' ' + parentHeader.path + '/' + name;
  if (parentHeader.path === null) {// parent is root
    itemIdentifier = type + ' ' + name;
  }
  if (summary === '') {
    summary = itemIdentifier + ' added';
  }
  updateIndex(parent, summary, function() {
    // create item page
    doEditRequest(parent.fullPath + '/' + name, 0, parent.getInvokeCode(), 'invoke page for MOOC ' + itemIdentifier + ' created', sucCallback);
  });
}

/**
 * Adds a lesson to a MOOC.
 * @param {String} lesson name
 * @param {Object} MOOC root item
 * @param {String} edit summary appendix for MOOC index edit; uses generated summary appendix if empty
 * @param {function} success callback
 */
function addLesson(name, item, summary, sucCallback) {
  addChild('lesson', name, item, summary, sucCallback);
}

/**
 * Adds an unit to a MOOC lesson.
 * @param {String} unit name
 * @param {Object} lesson the unit will be added to
 * @param {String} edit summary appendix for MOOC index edit; uses generated summary appendix if empty
 * @param {function} success callback
 */
function addUnit(name, item, summary, sucCallback) {
  addChild('unit', name, item, summary, sucCallback);
}

/**
 * Creates a MOOC.
 * @param {String} MOOC name
 * @param {String} edit summary for category, MOOC overview and MOOC index page
 * @param {function} success callback
 */
function createMooc(title, summary, sucCallback) {
  createPage('{{#invoke:Mooc|overview|base=' + title + '}}\n<noinclude>[[category:MOOC]]</noinclude>', summary, function() {// create category with overview
    createPage(title, '{{#invoke:Mooc|overview|base=' + title + '}}', summary, function() {// create MOOC overview page
      createPage(title + '/MoocIndex', '--MoocIndex for MOOC @ ' + title, summary, sucCallback);// create MOOC index
    });
  });
}

/**
 * Adds a thread to a talk page belonging to a MOOC item. Updates the item's discussion statistic in MOOC index.
 * @param {Object} MOOC item the talk page belongs to
 * @param {Object} talk page object
 * @param {String} title of the new thread
 * @param {String} content of the new thread
 * @param {function} success callback
 */
function addThread(item, talkPage, title, content, sucCallback) {//TODO: use updateIndex
  item.setParameter(PARAMETER_KEY.NUM_THREADS, (item.discussion.threads.length + 1).toString());
  item.setParameter(PARAMETER_KEY.NUM_THREADS_OPEN, (item.discussion.getNumOpenThreads() + 1).toString());
  addSectionToPage(talkPage.title, title, content, 'q:' + title, function() {
    // update discussion statistic in MOOC index
    doEditRequest(item.index.title, item.indexSection, item.tostring(), 'new thread in item discussion', sucCallback);
  });
}

/**
 * Updates a thread on a talk page belonging to a MOOC item. Updates the item's discussion statistic in MOOC index.
 * @param {Object} MOOC item the talk page belongs to
 * @param {Object} thread object
 * @param {function} success callback
 */
function saveThread(item, thread, sucCallback) {//TODO: use updateIndex
  item.setParameter(PARAMETER_KEY.NUM_THREADS, item.discussion.threads.length.toString());
  item.setParameter(PARAMETER_KEY.NUM_THREADS_OPEN, item.discussion.getNumOpenThreads().toString());
  doEditRequest(thread.talkPage.title, thread.section, thread.tostring(), 'replied to "' + thread.title + '"', function() {
    // update discussion statistic in MOOC index
    doEditRequest(item.index.title, item.indexSection, item.tostring(), 'new reply in item discussion', sucCallback);
  });
}

/**
 * Parses wikitext.
 * @param {String} wikitext to be parsed
 * @param {function} success callback (String parsedWikitext)
 * @param {function} (optional) failure callback
 */
function parseThreads(unparsedContent, sucCallback, errCallback) {
  AddinMooc_CONFIG.log(0, 'LOG_WPARSE', unparsedContent);
  var api = new mw.Api();
  var promise = api.post({
    'action': 'parse',
    'contentmodel': 'wikitext',
    'disablepp': true,
    'text': unparsedContent
  });
  promise.done(function(response) {
    AddinMooc_CONFIG.log(0, 'LOG_WPARSE_RES', JSON.stringify(response));
    var wikitext = response.parse.text['*'];
    sucCallback(wikitext);
  });
  if (typeof errCallback !== 'undefined') {
    promise.fail(errCallback);
  }
}

/**
 * Retrieves the URLs of any number of video files.
 * @param {Array<String>} array of titles of the files to retrieve an URL for (WARNING: should not include '_' to access the URL mapping in success callback correctly)
 * @param {function} callback when the URLs were retrieved successfully (An array mapping (page title) -> (url) will be passed. The page titles will not contain '_' but spaces.)
 */
function getVideoUrls(fileTitles, sucCallback) {
  //WTF: imageinfo does also work on video files
  var sFileTitles = fileTitles.join('|');
  var api = new mw.Api();
  api.get({
    action: 'query',
    prop: 'videoinfo',
    titles: sFileTitles,
    viprop: 'url'
  }).done(function(data) {
    var path = ['query', 'pages'];
    var crr = data;
    for (var i = 0; i < path.length; ++i) {
      if (crr && crr.hasOwnProperty(path[i])) {
        crr = crr[path[i]];
      } else {
        AddinMooc_CONFIG.log(1, 'ERR_WQUERY_VIDEO', path[i]);
        crr = null;
        break;
      }
    }
    var fileUrls = [];
    if (crr) {
      var pages = crr;
      for (var pageId in pages) {
        // page exists
        if (pages.hasOwnProperty(pageId)) {
          var page = pages[pageId];
          fileUrls[page.title] = page.videoinfo[0].url;
          AddinMooc_CONFIG.log(0, 'LOG_WQUERY_VIDEO_URL', page.title, page.videoinfo[0].url);
        }
      }
      sucCallback(fileUrls);
    }
  });
}

/*####################
  # INDEX UTILITIES
  # helper functions to load objects from and work with the MOOC index
  ####################*/
 
 /**
 * Creates a header instance holding identification data of the MOOC item.
 * @param {int} item level
 * @param {String} item type
 * @param {String} item title
 * @param {String} item path (relative to MOOC base)
 * @return {Object} MOOC item header to identify the item and write to MOOC index
 */
function Header(level, type, title, path) {
  return {
    'level': level,
    'path': path,
    'title': title,
    'type': type,
    'tostring': function() {
      var intendation = strrep('=', this.level);
      return intendation + this.type + '|' + this.title + intendation;
    }
  };
}

/**
 * Creates an item instance holding data extracted from MOOC index.
 * @param {Object} item header
 * @param {Object} MOOC index
 * @return {Object} MOOC item to get parameters and write to MOOC index
 */
function Item(header, index) {
  var loadingScript = false;
  var loadingQuiz = false;
  return {
    'childLines': [],
    'discussion': null,
    'fullPath': _fullPath,
    'header': header,
    'index': index,
    'indexSection': index.itemSection,
    'parameterKeys': [],
    'parameters': {},
    'script': null,
    'quiz': null,
    /**
     * @return {String} invoke code used for the current item
     */
    'getInvokeCode': function() {
      return '{{#invoke:Mooc|render|base=' + index.base + '}}';
    },
    /**
     * Gets the value for an item parameter.
     * @param {String} parameter key
     * @return {?} Value stored for the parameter key passed. May be undefined.
     */
    'getParameter': function(key) {
      return this.parameters[key];
    },
    /**
     * Sets the value for an item parameter.
     * @param {String} parameter key
     * @param {?} parameter value
     */
    'setParameter': function(key, value) {
      this.parameters[key] = value;
      if ($.inArray(key, this.parameterKeys) == -1) {
        this.parameterKeys.push(key);
      }
    },
    /**
     * Retrieves the script resource for this item.
     * @param {function} success callback (String scriptContent)
     * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
     */
    'retrieveScript': function(sucCallback, errCallback) {
      if (this.script !== null) {
        sucCallback(this.script);
      } else if (!loadingScript) {
        loadingScript = true;
        getScript(this, sucCallback, errCallback);
      } else {
        // does not happen
      }
    },
    /**
     * Retrieves the quiz resource for this item.
     * @param {function} success callback (String quizContent)
     * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
     */
    'retrieveQuiz': function(sucCallback, errCallback) {
      if (this.quiz !== null) {
        sucCallback(this.quiz);
      } else if (!loadingQuiz) {
        loadingQuiz = true;
        getQuiz(this, sucCallback, errCallback);
      } else {
        // does not happen
      }
    },
    /**
     * @return MOOC index content for this item
     */
    'tostring': function() {
      var lines = [];
      // header line
      if (this.indexSection !== null) {// except root item
        lines.push(this.header.tostring());
      }
      // parameters
      var key, value;
      this.parameterKeys.sort();
      for (var i = 0; i < this.parameterKeys.length; ++i) {
        key = this.parameterKeys[i];
        value = this.parameters[key];
        if (value.indexOf("\n") != -1) {// linebreak for multi line values
          lines.push('*' + key + '=\n' + value);
        } else {
          lines.push('*' + key + '=' + value);
        }
      }
      // children
      for (var c = 0; c < this.childLines.length; ++c) {
        lines.push(this.childLines[c]);
      }
      return lines.join('\n');
    }
  };
}

/**
 * Creates a MOOC index instance providing read access.
 * @param {String} MOOC page title
 * @param {String} MOOC base
 * @return {Object} MOOC index instance to retrieve item
 */
function MoocIndex(title, base) {
  var isLoading = false;
  return {
    'base': base,
    'item': null,
    'itemPath': null,
    'itemSection': null,
    'title': title,
    /**
     * Sets the current item. MUST be called before using this object.
     * @param {int} section of the item within the MOOC index
     * @param {String} absolute path of the item
     */
    'useItem': function(section, path) {
      this.itemSection = section;
      this.itemPath = path;
    },
    /**
     * Retrieves the current item from the MOOC index.
     * If the item is not cached this call will trigger a network request.
     * @param {function} success callback (String indexContent)
     * @param {function} (optional) failure callback (Object jqXHR: HTTP request object)
     */
    'retrieveItem': function(sucCallback, errCallback) {
      if (this.item !== null) {
        sucCallback(this.item);
      } else {
        var index = this;
        if (!isLoading) {// retrieve index and load item
          isLoading = true;
          getIndex(this.title, this.itemSection, function(indexContent) {
            var indexLines = splitLines(indexContent);
            var item;

            if (index.itemSection === null) {// root item
              item = Item(Header(0, 'mooc', index.base, null), index);
              // do not interprete index
              for (var i = 0; i < indexLines.length; ++i) {
                item.childLines.push(indexLines[i]);
              }
            } else {// index item
              var header = loadHeader(indexLines[0], index.base, index.itemPath);
              item = Item(header, index);
              // load properties and lines of child items
              var childLines = false;
              for (var i = 1; i < indexLines.length; i++) {
                if (!childLines) {
                  if (getLevel(indexLines[i]) > 0) {
                    childLines = true;
                  } else {
                    var property = loadProperty(indexLines, i);
                    item.setParameter(property.key, property.value);
                    i = property.iEnd;
                  }
                }
                if (childLines) {
                  item.childLines.push(indexLines[i]);
                }
              }
            }
            index.item = item;
            isLoading = false;
            sucCallback(item);
          });
        } else {// another process triggered network request
          setTimeout(function() {
            if (index.item !== null) {
              sucCallback(index.item);
            } else if (!isLoading && typeof(errCallback) !== 'undefined') {
              errCallback();
            }
          }, 100);
        }
      }
    }
  };
}

 /**
 * Loads the header of a MOOC item from its index header line.
 * @param {String} item's header line from MOOC index
 * @param {String} MOOC base
 * @param {String} item path (absolute path including MOOC base)
 * @return {Object} MOOC item header loaded from header line. Returns null if header line malformed.
 */
function loadHeader(line, base, fullPath) {
  var level = getLevel(line);
  if (level > 0) {
    var iSeparator = line.indexOf('|');
    if (iSeparator > -1) {
      var type = line.substring(level, iSeparator);
      var title = line.substring(iSeparator + 1, line.length - level);
      var path = fullPath.substring(base.length + 1);// relative path
      AddinMooc_CONFIG.log(0, 'LOG_INDEX_HEADER', type, title, level, path);
      return Header(level, type, title, path);
    }
  }
  AddinMooc_CONFIG.log(1, 'ERR_INDEX_HEADER', line);
  return null;
}

/**
 * Loads a parameter of an item.
 * @param {Array} MOOC index lines
 * @param {int} start index of the parameter within index
 * @return {Object} item parameter extracted (key, value) and index of last line related to parameter (iEnd)
 */
function loadProperty(indexLines, iLine) {
  var line = indexLines[iLine];
  var iSeparator = line.indexOf('=');
  if (iSeparator != -1) {
    var paramLines = [];
    var key = line.substring(1, iSeparator);
    // read parameter value
    var i = iLine;
    var value = line.substring(iSeparator + 1);
    do {
      if (i > iLine) {// valor multilinha
        if (paramLines.length === 0 && value.length > 0) {// empurra valor da primeira linha se existir
          paramLines.push(value);
        }
        paramLines.push(line);
      }
      i += 1;
      line = indexLines[i];
    } while(i < indexLines.length && line.substring(0, 1) !== '*' && getLevel(line) === 0);
    i -= 1;

    if (paramLines.length > 0) {
      value = paramLines.join('\n');
    }
    return {
      'iEnd': i,
      'key': key,
      'value': value
    };
  }
  return null;
}

/*####################
  # UTILIDADES DE DISCUSSÃO
  # funções auxiliares para trabalhar com objetos de discussão
  ####################*/

/**
 * Cria uma instância de discussão contendo dados extraídos de várias páginas de discussão.
 * @return {Object} intância de discussão d com
 * * {int} d.lastId: identificador de post usado mais alto 
 * * d.lost
 * * {Array<Object>} d.talkPages: instâncias da página de discussão
 * * {Array<Object>} d.threads: tópicos carregados da página de discussão
 * * {int} d.getNumPosts()
 * * {int} d.getNumOpenThreads()
 * * {String} d.tostring()
 */
function Discussion() {
  return {
    'lastId': 0,
    'lost': [],
    'talkPages' : [],
    'threads': [],
    'getNumPosts': function() {
      var numPosts = 0;
      for (var i = 0; i < this.threads.length; ++i) {
        numPosts += this.threads[i].getNumPosts();
      }
      return numPosts;
    },
    'getNumOpenThreads': function() {
      var numOpenThreads = 0;
      for (var i = 0; i < this.threads.length; ++i) {
        if (this.threads[i].getNumPosts() === 1) {
          numOpenThreads += 1;
        }
      }
      return numOpenThreads;
    },
    'tostring': function() {
      var value = [];
      for (var i = 0; i < this.threads.length; ++i) {
        value.push(this.threads[i].tostring());
      }
      for (var j = 0; j < this.lost.length; ++j) {
        value.push(this.lost[j]);
      }
      return value.join('\n');
    }
  };
}

/**
 * Cria uma instância de post contendo dados extraídos da página de discussão.
 * @param {int} identificador de post único
 * @param {int} nível do post
 * @param {Array<String>} linhas de conteúdo do post
 * @param {Array<Object>} posts que respondem a essa postagem
 * @param {Object} objeto de assinatura
 * @return {Object} instância de post p com
 * * {int} p.id
 * * {String} p.content
 * * {String} p.htmlContent
 * * {Array<Object>} p.replies
 * * {Object} p.signature
 * * {int} p.getNumPosts()
 * * {boolean} p.isValid()
 * * {String} p.tostring()
 */
function Post(id, level, content, replies, signature) {
  return {
    'id': id,
    'content': content.join('\n'),
    'htmlContent': this.content,
    'level': level,
    'replies': replies,
    'signature': signature,
    'getNumPosts': function() {
      var num = 1;
      for (var i = 0; i < this.replies.length; ++i) {
        num += this.replies[i].getNumPosts();
      }
      return num;
    },
    'isValid': function() {
      // post malformado: falta assinatura
      return (this.signature !== null);
    },
    'tostring': function() {
      var value = [];
      var firstLine = strrep(':', this.level) + this.content;
      if (this.signature !== null) {
        firstLine += ' ' + this.signature.towikitext();
      }
      value.push(firstLine);
      for (var i = 0; i < this.replies.length; ++i) {
        value.push(this.replies[i].tostring());
      }
      return value.join('\n');
    }
  };
}

/**
 * Cria uma instância de página de discussão.
 * @param {String} título da página de discussão
 * @return {Object} instância da página de discussão t com
 * * {Array<Object>} t.threads: tópicos na página de discussão
 * * {String} t.title: título da página de discussão
 */
function TalkPage(title) {
  return {
    'threads': [],
    'title': title
  };
}

/**
 * Cria uma instância de tópico que contém dados extraídos da página de discussão.
 * @param {String} título do tópico (com espaço em branco principal/à direita)
 * @param {int} seção do tópico dentro da página de discussão
 * @return {Object} instância de tópico t sendo uma instância de post com 
 * * {Array<String>} t.content
 * * {Array<String>} t.lost
 * * {int} t.published
 * * {int} t.section
 * * {String} t.title
 */
function Thread(title, section) {
  var thread = Post(0, 0, [], [], null);
  thread.content = [];
  thread.lost = [];
  thread.published = 0;
  thread.section = section;
  thread.title = $.trim(title);
  thread.tostring = function() {
    var value = [];
    value.push('==' + this.title + '==');
    value.push(this.content);
    if (this.signature !== null) {
      value.push(this.signature.towikitext());
    }
    for (var i = 0; i < this.replies.length; ++i) {
      value.push(this.replies[i].tostring());
    }
    return value.join('\n');
  };
  return thread;
}

/**
 * Cria um objeto de assinatura vazio.
 * @param {String} valor do "towikitext" do objeto retornado pela função
 * @return {Object} objeto assinatura vazio retornando o valor dado na função "towikitext"
 */
function createPseudoSignature(value) {
  return {
    'towikitext': function() {
      return value;
    }
  };
}

/**
 * Corta o conteúdo do tópico em um certo comprimento como uma pré-visualização.
 * @param {Object} tópico com conteúdo a ser cortado
 * @param {int} número máximo de caracteres para a pré-visualização
 * @return {String} conteúdo de tópico com comprimento máximo após '...'
 */
function cutThreadContent(thread, maxLength) {
  var div = document.createElement('div');
  div.innerHTML = thread.htmlContent;
  var text = div.textContent || div.innerText || '';
  
  if (thread.htmlContent.length <= maxLength) {
    return thread.htmlContent;
  }
  var cutContent = [];
  var crrLength = 0;
  var words = text.split(/\s/);
  for (var i = 0; i < words.length; ++i) {
    crrLength += words[i].length + 1;
    if (crrLength > maxLength) {
      break;
    }
    cutContent.push(words[i]);
  }
  return cutContent.join(' ') + '...';
}

/**
 * Procura uma postagem para um determinado identificador de postagem. Inclui publicação especificada e todas as suas respostas.
 * @param {Object} instância do post onde procurar
 * @param {int} identificador do post pesquisado
 * @return {Object} o com
 * * {Object} o.post: instância de post instance com identificador pesquisado
 * ou nulo se não encontrado um post específico
 */
function findPostInPost(post, postId) {
  if (post.id == postId) {
    return {
      'post': post
    };
  }
  for (var i = 0; i < post.replies.length; ++i) {
    var reply = post.replies[i];
    var result = findPostInPost(reply, postId);
    if (result !== null) {
      return result;
    }
  }
  return null;
}

/**
 * Pesquisa todos os tópicos para um determinado identificador de postagem.
 * @param {int} identificador de post pesquisado
 * @return {Object} o com
 * * {Object} o.post: instância de post com identificador pesquisado
 * * {Object} o.thread: instância de tópico ao qual o post pertence
 * ou nulo se não encontrado
 */
function findPostInThread(postId) {
  for (var i = 0; i < discussion.threads.length; ++i) {
    var result = findPostInPost(discussion.threads[i], postId);
    if (result !== null) {
      result.thread = discussion.threads[i];
      return result;
    }
  }
  return null;
}

/**
 * Recupera a instância de uma determinada página de discussão. Cria uma nova instância se não existir.
 * @param {String} título da página de discussão
 * @return {Object} instância de página de discussão
 */
function getTalkPage(talkPageTitle) {
  for (var i = 0; i < discussion.talkPages.length; ++i) {
    if (discussion.talkPages[i].title === talkPageTitle) {
      return discussion.talkPages[i];
    }
  }
  // retorna objeto de página de discussão vazia
  return TalkPage(talkPageTitle);
}

/**
 * Carrega um post de uma página de discussão.
 * @param {Array<String>} linha de texto contendo o post
 * @param {int} índice da linha em que o post começa
 * @param {int} identificador de post usado mais alto
 * @return {Object} o com
 * * {Object} o.post: instância de post
 * * {int} o.iEnd: índice da linha em que o post termina
 * * {int} o.iLastId: identificador de post usado mais alto
 */
function loadPost(lines, iStart, lastId) {
  // get level
  var firstLine = lines[iStart];
  var level = getPostLevel(firstLine);
  firstLine = firstLine.substring(level);
  var content = [];
  var signature = loadSignature(firstLine);
  if (signature === null) {
    content.push(firstLine);
  }
  var id = ++lastId;
  
  var nextLevel;
  var line;
  var i = iStart + 1;
  var replies = [];
  while (i < lines.length) {
    line = lines[i];
    nextLevel = getPostLevel(line);
    if (nextLevel > 0 || line.length > 0) {
      if (nextLevel < level) {// novo post em um nível maior
        break;
      } else if (nextLevel > level) {// reply
        var reply = loadPost(lines, i, lastId);
        if (reply.post.isValid()) {
          replies.push(reply.post);
        }
        i = reply.iEnd;
        lastId = reply.lastId;
      }
    }
    if (nextLevel == level) {// post no mesmo nível
      if (signature !== null) {// novo post no mesmo nível
        break;
      } else {// post atual: adiciona e procura por assinatura
        line = line.substring(level);
        signature = loadSignature(line);
        if (signature === null) {// assinatura não encontrada: adiciona conteúdo
          content.push(line);
        }
        i += 1;
      }
    } else if (nextLevel === 0 && line.length === 0) {// ignora linha vazia
      i += 1;
    }
  }
  if (signature !== null) {// assinatura encontrada: adiciona conteúdo de linha de assinatura, se houver
    if (signature.content !== null) {
      content.push(signature.content);
    }
    signature = signature.value;
  }
  
  return {
    'post': Post(id, level, content, replies, signature),
    'iEnd': i,
    'lastId': lastId
  };
}

/**
 * Carrega um objeto de assinatura de uma assinatura wikitext.
 * @param {String} linha terminada com uma assinatura wikitext
 * @return {Object} o com
 * * {String} o.content: texto na linha antes da assinatura
 * * {Object} o.value: objeto de assinatura 
 */
function loadSignature(line) {
  var pos = line.indexOf('--[[');
  if (pos != -1) {
    var content = null;
    if (pos > 0) {
      content = line.substring(0, pos);
    }
    var value = line.substring(pos);
    
    // parse timestamp
    var vcopy = value.substring(4);
    var sNamespaceUser = AddinMooc_CONFIG.get('MW_NAMESPACE_USER') + ':';
    var sPageContributions = AddinMooc_CONFIG.get('MW_PAGE_CONTRIBUTIONS') + '/';
    var username = null;
    
    if (vcopy.substring(0, sNamespaceUser.length) == sNamespaceUser) {// user signature e.g. "--[[Benutzer:Sebschlicht|Sebschlicht]] ([[Benutzer Diskussion:Sebschlicht|Diskussion]]) 10:20, 12. Nov. 2014 (CET)"
      var patternUsername = new RegExp('[^\|]*');
      username = vcopy.match(patternUsername);
      if (username !== null) {
        username = username[0];
        username = username.substring(sNamespaceUser.length);
      }
    } else if (vcopy.substring(0, sPageContributions.length) == sPageContributions) {// IP signature e.g. "--[[Special:Contributions/81.17.28.58|81.17.28.58]] ([[User talk:81.17.28.58|discuss]]) 10:00, 23 October 2013 (UTC)"
      var patternIpAddress = new RegExp('[^\|]*');
      username = vcopy.match(patternIpAddress);
      if (username !== null) {
        username = username[0];
        username = username.substring(sPageContributions.length);
        console.log('IP address: ' + username);
      }
    }
    
    if (username != null) {
      var sTimestamp = vcopy.match(/\).+?$/);
      if (sTimestamp == null) {
      	console.log('german IP signature');
        sTimestamp = vcopy.match(/\].+?$/);
        if (sTimestamp !== null) {
          sTimestamp[0] = sTimestamp[0].substring(1);
        }
      }
      if (sTimestamp !== null) {
        sTimestamp = sTimestamp[0];
        sTimestamp = sTimestamp.substring(2);
        var timestamp = parseTimestamp(sTimestamp);
        console.log('timestamp: ' + timestamp);
        
        return {
          'content': content,
          'value': {
            'author': username,
            'timestamp': timestamp,
            'tostring': function() {
              return AddinMooc_CONFIG.message('UI_POST_SIGNATURE', dateToString(this.timestamp), this.author);
            },
            'towikitext': function() {
              return value;
            }
          }
        };
      }
    }
  }
  // sem assinatura ou assinatura mal formada
  return null;
}

/**
 * Carrega um tópico. Separa o conteúdo do tópico das respostas.
 * @param {Object} instância de tópico t com todos os textos pertencentes ao tópico no t.content
 * @param {int} identificador de post usado mais alto
 * @return {Object} o com
 * * {int} o.lastId: identificador de post usado mais alto
 * * {Object} o.value: instância de tópico carregada
 */
function loadThread(thread, lastId) {
  var lines = thread.content;
  var content = [];
  var i = 0;
  var signature = null;
  var id = ++lastId;
  while (i < lines.length) {
    var level = getPostLevel(lines[i]);
    if (level > 0) {// post
      var post = loadPost(lines, i, lastId);
      i = post.iEnd;
      lastId = post.lastId;
      if (post.post.isValid()) {
        thread.replies.push(post.post);
      } else {//copia as postagens inválidas na seção perdida da thread
        thread.lost.push(post.post.content);
        AddinMooc_CONFIG.log(0, 'LOG_DIS_POST_INVALID', post.post.id, post.post.content);
      }
    } else {// conteúdo do tópico
      if (signature === null) {// nenhuma assinatura encontrada
        signature = loadSignature(lines[i]);
        if (signature === null) {// nenhuma assinatura encontrada: adiciona conteúdo
          content.push(lines[i]);
        } else if (signature.content !== null) {// assinatura encontrada: adiciona conteúdo de linha de assinatura, se existir
          content.push(signature.content);
        }
      } else {// assinatura encontrada e mal formada
        content.push(lines[i]);
      }
      i += 1;
    }
  }
  // remove linhas novas
  if (content[0] == '') {
    content.shift();
  }
  if (content[content.length - 1] == '') {
    content.pop();
  }
  thread.id = id;
  thread.content = content.join('\n');
  if (signature !== null) {
    thread.signature = signature.value;
    thread.published = thread.signature.timestamp.getTime();
  }
  return {
    'lastId': lastId,
    'value': thread
  };
}

/**
 * Carrega todas os tópicos de uma página de discussão.
 * @param {Array<String>} conteúdo da página de discussão
 * @param {int} identificador de post usado mais alto
 * @return {Object} o com
 * * {int} o.lastId: identificador de post usado mais alto
 * * {Array<String>} o.lost
 * * {Array<Object>} o.threads: tópicos contidos na página de discussão
 */
function loadThreads(lines, lastId) {
  var rawThreads = splitThreads(lines);
  var threads = [];
  // carrega threads com suas respostas
  for (var i = 0; i < rawThreads.threads.length; ++i) {
    var thread = loadThread(rawThreads.threads[i], lastId);
    lastId = thread.lastId;
    threads.push(thread.value);
  }
  return {
    'lastId': lastId,
    'lost': rawThreads.lost,
    'threads': threads
  };
}

/**
 * Carrega os tópicos de um número de páginas de discussão em uma instância de discussão.
 * @param {Array<String>} títulos das páginas de discussão a serem carregadas
 * @param {int} índice dentro dos títulos passados da página de conversação para carregar
 * @param {Object} instância de discussão para empurrar os tópicos
 * @param {function} termina o retorno de chamada
 */
function mergeThreads(talkPageTitles, iCrrPage, discussion, callback) {
  if (iCrrPage < talkPageTitles.length) {
    var talkPage = TalkPage(talkPageTitles[iCrrPage]);
    doPageContentRequest(talkPage.title, null, function(pageContent) {
      var lines = splitLines(pageContent);
      var parsed = loadThreads(lines, discussion.lastId);
      var pageThreads = parsed.threads;
      for (var t = 0; t < pageThreads.length; ++t) {
        var pageThread = pageThreads[t];
        pageThread.talkPage = talkPage;
        talkPage.threads.push(pageThread);
        discussion.talkPages.push(talkPage);
        discussion.threads.push(pageThread);
      }
      discussion.lastId = parsed.lastId;
      mergeThreads(talkPageTitles, iCrrPage + 1, discussion, callback);
    }, function() {// ao falhar em recuperar uma página de discussão, assume que não existe e continua
      mergeThreads(talkPageTitles, iCrrPage + 1, discussion, callback);
    });
  } else {
    callback();
  }
}

/**
 * Carrega tópicos de páginas de discussão, injeta-as na seção de discussão e permite a discussão global na página.
 * @param {Array<String>} títulos da página de discussão a serem carregadas
 */
function renderThreads(talkPageTitles) {
  mergeThreads(talkPageTitles, 0, discussion, function() {
    // insert ask question UI
    insertAskQuestionUI('learningGoals', talkPageTitles[0], false);
    insertAskQuestionUI('video', talkPageTitles[0], false);
    insertAskQuestionUI('script', talkPageTitles[1], false);
    insertAskQuestionUI('quiz', talkPageTitles[2], false);
    insertAskQuestionUI('furtherReading', talkPageTitles[0], false);
    insertAskQuestionUI('discussion', talkPageTitles[0], true);
    
    var threads = discussion.threads;
    AddinMooc_CONFIG.log(0, 'LOG_DIS_NUMTHREADS', threads.length, talkPageTitles);
    threads.sort(function(t1, t2) {// ordena os tópicos por tempo de publicação (DESC)
      if (t1.published > t2.published) {
        return -1;
      } else if (t1.published < t2.published) {
        return 1;
      } else {
        return 0;
      }
    });
    
    var injectThreads = function() {
      var divDiscussion = $('#discussion > .content');
      for (var j = 0; j < threads.length; ++j) {
        var nThread = renderThread(threads[j]);
        divDiscussion.append(nThread);
        if (threads.length > 2) {// une tópicos, se forem muitos
          collapseThread(nThread, threads[j]);
        }
        
        if (!threads[j].isValid()) {// conteúdo inválido: não assinado
        }
        if (threads[j].lost.length > 0) {// contém post inválidos: não assinados
        }
      }
    };
    
    // analisa conteúdo de tópicos e injeta tópicos
    var getContentNodes = function(post) {
      var nodes = [];
      nodes.push($('<div>', {'id':post.id}).html(post.content));
      for (var i = 0; i < post.replies.length; ++i) {
        nodes = nodes.concat(getContentNodes(post.replies[i]));
      }
      return nodes;
    };
    var nContent = $('<div>');
    for (var i = 0; i < threads.length; ++i) {
      var nodes = getContentNodes(threads[i]);
      for (var n = 0; n < nodes.length; ++n) {
        nContent.append(nodes[n]);
      }
    }
    parseThreads(nContent.html(), function(parsedContent) {
      var nThreads = $.parseHTML(parsedContent);
      var adoptContentNodes = function(post, nodes, iCrr) {
        post.htmlContent = nodes[iCrr].html();
        iCrr += 1;
        for (var i = 0; i < post.replies.length; ++i) {
          iCrr = adoptContentNodes(post.replies[i], nodes, iCrr);
        }
        return iCrr;
      };
      var nodes = [];
      $.each(nThreads, function(i, el) {
        var nThread = $(el);
        if (typeof nThread.attr('id') !== 'undefined') {
          nodes.push($(el));
        }
      });
      var iCrr = 0;
      for (var i = 0; i < threads.length; ++i) {
        iCrr = adoptContentNodes(threads[i], nodes, iCrr);
      }
      injectThreads();
    }, function() {// injeta tópicos não analisados se a análise falhar
      injectThreads();
    });
  });
}

/**
 * Divide uma página de discussão em tópicos únicos.
 * @param {Array<String>} conteúdo da página de discussão
 * @return {Object} o com
 * * {Array<Object>} o.threads: objetos de tópicos
 * * {int} o.lost: índice da última linha na sessão raiz (que não pertença a nenhum tópico)
 */
function splitThreads(lines) {
  var threads = [];
  var thread = null;
  var level = 0, line, iLost = -1, section = 0;
  for (var i = 0; i < lines.length; ++i) {
    line = lines[i];
    level = getLevel(line);
    if (level > 0) {
      if (level == 2) {// novo tópico
        if (thread !== null) {// conteúdo armazenado 
          threads.push(thread);
        }
        thread = Thread(line.substring(level, line.length - level), ++section);
        AddinMooc_CONFIG.log(0, 'LOG_DIS_THREAD_SECTION', line, section);
      } else {
        // má-formação: cabeçalho em um nível inválido
        section += 1;
        thread.content.push(line);
      }
    } else {// conteúdo do tópico
      if (thread !== null) {
        thread.content.push(line);
      } else {// conteúdo não pertence a nenhum tópico
        iLost = i;
      }
    }
  }
  if (thread !== null) {
    threads.push(thread);
  }
  
  return {
    'threads': threads,
    'lost': iLost
  };
}

/*####################
  # UTILIDADES
  # funções auxiliares de baixo nível
  ####################*/
 
/**
 * Repete o valor de uma string um dado número de vezes.
 * @param {String} valor a repetir
 * @param {int} número de vezes a repetir o valor
 * @return {String} valor repetido o dado número de vezes
 */
function strrep(value, numRepeat) {
	return new Array(numRepeat + 1).join(value);
}

/**
 * Corta um texto em suas linhas individuais.
 * @param {String} texto multilinha
 * @return {Array} linhas de texto único
 */
function splitLines(text) {
  return text.split(/\r?\n/);
}

/**
 * Analisa um objeto data em uma string
 * @param {Date} data a ser analisada
 * @return {String} string representando a data passada (YYYY/MM/dd HH:mm)
 */
function dateToString(date) {
  return (date.getYear() + 1900) + "/" + date.getMonth() + "/" + date.getDate() + " " + date.getHours() + ":" + date.getMinutes();
}

/**
 * Calcula o nível do cabeçalho de uma linha wikitext.
 * @param {String} linha wikitext
 * @return {int} nível do cabeçalho da linha passada, 0 se a linha não tem cabeçalho
 */
function getLevel(line) {
  var sLevelStart = line.match('^=*');
  if (sLevelStart.length > 0 && sLevelStart[0]) {
    var sLevelEnd = line.match('=*$');
    if (sLevelEnd.length > 0 && sLevelEnd[0]) {
      return Math.min(sLevelStart[0].length, sLevelEnd[0].length);
    }
  }
  return 0;
}

/**
 * Converte o nome do mês ao index.
 * @param {String} nome do mês
 * @return {int} índice do mês começando com 1; -1 se o nome do mês é desconhecido
 * @veja http://stackoverflow.com/questions/13566552/easiest-way-to-convert-month-name-to-month-number-in-js-jan-01
 */
function getMonthFromString(mon){
  // en: "August"
  // de: "Nov."
  var month = mon.replace('.', '');
  var d = Date.parse(month + "1, 2014");
  if (!isNaN(d)){
    return new Date(d).getMonth() + 1;
  }
  return -1;
}

/**
 * Calcula o nível de publicação de uma linha de página de discussão.
 * @param {String} linha da página de conversação
 * @return {int} nível de postagem da linha passada
 */
function getPostLevel(line) {
  var level = line.match('^:*');
  if (level.length > 0 && level[0]) {
    return level[0].length;
  }
  return 0;
}

/**
 * Calcula o comprimento da assinatura em um post.
 * @param {String} conteúdo do post
 * @return {int} comprimento da assinatura; 0 se o post não foi assinado
 */
function getSignatureLength(content) {
  if (content.match(/\~\~\~\~$/) !== null) {
    if ((content.match(/\-\-\~\~\~\~$/) !== null)) {
      return 6;
    }
    return 4;
  }
  return 0;
}

/**
 * Retorna o título da página de conversação de uma página wiki.
 * @param {String} título da página wiki
 * @return {String} título da página de conversação da página wiki especificada
 */
function getTalkPageTitle(pageTitle) {
  var iNamespace = pageTitle.indexOf(':');
  var iSlash = pageTitle.indexOf('/');
  var sNamespaceTalk = AddinMooc_CONFIG.get('MW_NAMESPACE_TALK');
  if (iNamespace == -1 || iNamespace > iSlash) {
    return sNamespaceTalk + ':' + pageTitle;
  }
  var namespace = pageTitle.substring(0, iNamespace);
  return namespace + ' ' + sNamespaceTalk.toLowerCase() + pageTitle.substring(iNamespace);
}

/**
 * Retira um texto de mensagem de qualquer caractere indesejado.
 * 1.) indentação manual
 * 2.) títulos de threads adicionais
 * 3.) assinatura manual
 * 4.) espaço em branco adicional ou à direita
 * @param {String} conteúdo do post
 * @return {String} conteúdo do post retirado
 */
function stripPost(content) {
  var lines = splitLines(content);
  var line, postLevel, level;
  for (var i = 0; i < lines.length; ++i) {
    line = lines[i];
    postLevel = getPostLevel(line);
    if (postLevel > 0) {
      line = line.substring(postLevel);
    }
    level = getLevel(line);
    if (level > 0) {
      line = line.substring(level, line.length - level);
    }
    lines[i] = line;
  }
  var post = lines.join('\n');
  // remove assinatura adicionada manualmente
  var signatureLength = getSignatureLength(post);
  if (signatureLength > 0) {
    post = post.substring(0, post.length - signatureLength);
  }
  // remove espaço em branco adicional ou à direita
  return $.trim(post);
}

/**
 * Analisa um wiki timestamp para um objeto data.
 * @param {String} timestamp no formato wiki
 * @return {Date} objeto data representando o timestamp determinado; nulo se a análise falhar
 */
function parseTimestamp(value) {
  var time = value.substring(0, 5);
  var timeParts = time.split(':');
  var day = value.substring(7);
  var dayParts = day.split(' ');
  var date = new Date();
  var month = getMonthFromString(dayParts[1]);
  if (month != -1) {
    day = dayParts[0].replace('.', '');
    date.setUTCDate(day);
    date.setUTCMonth(month);
    date.setUTCFullYear(dayParts[2]);
    date.setUTCHours(timeParts[0]);
    date.setUTCMinutes(timeParts[1]);
    return date;
  }
  return null;
}
mw.loader.load('https://pt.wikiversity.org/w/index.php?title=MediaWiki:Common.css/addin-mooc.css&action=raw&ctype=text/css', 'text/css');
//</nowiki>
