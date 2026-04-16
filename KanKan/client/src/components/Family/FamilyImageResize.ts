import Image from '@tiptap/extension-image';

type ResizeLimits = {
  minWidth?: number;
  maxWidth?: number;
};

type ImageResizeContext = {
  node: any;
  editor: any;
  view: any;
  getPos?: (() => number) | undefined;
};

const CONSTANTS = {
  MOBILE_BREAKPOINT: 768,
  ICON_SIZE: '24px',
  CONTROLLER_HEIGHT: '25px',
  DOT_SIZE: {
    MOBILE: 16,
    DESKTOP: 9,
  },
  DOT_POSITION: {
    MOBILE: '-8px',
    DESKTOP: '-4px',
  },
  COLORS: {
    BORDER: '#6C6C6C',
    BACKGROUND: 'rgba(255, 255, 255, 1)',
  },
  ICONS: {
    LEFT: 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/format_align_left/default/20px.svg',
    CENTER: 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/format_align_center/default/20px.svg',
    RIGHT: 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/format_align_right/default/20px.svg',
    LIGHTBOX: 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/auto_awesome/default/20px.svg',
    CYCLE: 'https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/swap_horiz/default/20px.svg',
  },
} as const;

const utils = {
  isMobile() {
    return document.documentElement.clientWidth < CONSTANTS.MOBILE_BREAKPOINT;
  },
  getDotPosition() {
    return utils.isMobile() ? CONSTANTS.DOT_POSITION.MOBILE : CONSTANTS.DOT_POSITION.DESKTOP;
  },
  getDotSize() {
    return utils.isMobile() ? CONSTANTS.DOT_SIZE.MOBILE : CONSTANTS.DOT_SIZE.DESKTOP;
  },
  clearContainerBorder(container: HTMLElement) {
    const containerStyle = container.getAttribute('style');
    const newStyle = containerStyle?.replace('border: 1px dashed #6C6C6C;', '').replace('border: 1px dashed rgb(108, 108, 108)', '');
    container.setAttribute('style', newStyle || '');
  },
  removeResizeElements(container: HTMLElement) {
    while (container.childElementCount > 1) {
      container.removeChild(container.lastChild!);
    }
  },
};

class StyleManager {
  static getContainerStyle(inline: boolean, width?: string) {
    const baseStyle = `width: ${width || '100%'}; height: auto; cursor: pointer;`;
    const inlineStyle = inline ? 'display: inline-block;' : '';
    return `${baseStyle} ${inlineStyle}`;
  }

  static getWrapperStyle(inline: boolean) {
    return inline ? 'display: inline-block; float: left; padding-right: 8px;' : 'display: flex';
  }

  static getPositionControllerStyle(inline: boolean) {
    const width = inline ? '132px' : '166px';
    return `
      position: absolute;
      top: 0%;
      left: 50%;
      width: ${width};
      height: ${CONSTANTS.CONTROLLER_HEIGHT};
      z-index: 999;
      background-color: ${CONSTANTS.COLORS.BACKGROUND};
      border-radius: 3px;
      border: 1px solid ${CONSTANTS.COLORS.BORDER};
      cursor: pointer;
      transform: translate(-50%, -50%);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 6px;
    `
      .replace(/\s+/g, ' ')
      .trim();
  }

  static getDotStyle(index: number) {
    const dotPosition = utils.getDotPosition();
    const dotSize = utils.getDotSize();
    const positions = [
      `top: ${dotPosition}; left: ${dotPosition}; cursor: nwse-resize;`,
      `top: ${dotPosition}; right: ${dotPosition}; cursor: nesw-resize;`,
      `bottom: ${dotPosition}; left: ${dotPosition}; cursor: nesw-resize;`,
      `bottom: ${dotPosition}; right: ${dotPosition}; cursor: nwse-resize;`,
    ];
    return `
      position: absolute;
      width: ${dotSize}px;
      height: ${dotSize}px;
      border: 1.5px solid ${CONSTANTS.COLORS.BORDER};
      border-radius: 50%;
      ${positions[index]}
    `
      .replace(/\s+/g, ' ')
      .trim();
  }
}

class AttributeParser {
  static parseImageAttributes(nodeAttrs: Record<string, unknown>, imgElement: HTMLImageElement) {
    Object.entries(nodeAttrs).forEach(([key, value]) => {
      if (value === undefined || value === null || key === 'wrapperStyle') return;
      if (key === 'containerStyle') {
        const width = String(value).match(/width:\s*([0-9.]+)px/);
        if (width) {
          imgElement.setAttribute('width', width[1]);
        }
        return;
      }
      imgElement.setAttribute(key, String(value));
    });
  }

  static extractWidthFromStyle(style: string) {
    const width = style.match(/width:\s*([0-9.]+)px/);
    return width ? width[1] : null;
  }
}

function clampWidth(width: number, limits: ResizeLimits) {
  const { minWidth, maxWidth } = limits;
  const absoluteMin = minWidth !== undefined ? Math.max(0, minWidth) : 0;
  let clampedWidth = Math.max(absoluteMin, width);
  if (maxWidth !== undefined && clampedWidth > maxWidth) {
    clampedWidth = maxWidth;
  }
  return clampedWidth;
}

class PositionController {
  constructor(
    private readonly elements: { wrapper: HTMLDivElement; container: HTMLDivElement; img: HTMLImageElement },
    private readonly inline: boolean,
    private readonly dispatchNodeView: () => void,
    private readonly contentRoot: HTMLElement,
  ) {}

  createControllerIcon(src: string) {
    const controller = document.createElement('img');
    controller.setAttribute('src', src);
    controller.setAttribute('data-kankan-controller-icon', 'true');
    controller.setAttribute('style', `width: ${CONSTANTS.ICON_SIZE}; height: ${CONSTANTS.ICON_SIZE}; cursor: pointer;`);
    const stopPressBehavior = (event: Event) => {
      event.stopPropagation();
    };
    controller.addEventListener('mousedown', stopPressBehavior);
    controller.addEventListener('pointerdown', stopPressBehavior);
    controller.addEventListener('mouseover', (event) => {
      (event.target as HTMLElement).style.opacity = '0.6';
    });
    controller.addEventListener('mouseout', (event) => {
      (event.target as HTMLElement).style.opacity = '1';
    });
    return controller;
  }

  handleLeftClick(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.inline) {
      this.elements.container.setAttribute('style', `${this.elements.container.style.cssText} margin: 0 auto 0 0;`);
    } else {
      const style = 'display: inline-block; float: left; padding-right: 8px;';
      this.elements.wrapper.setAttribute('style', style);
      this.elements.container.setAttribute('style', style);
    }
    this.dispatchNodeView();
  }

  handleCenterClick(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.elements.container.setAttribute('style', `${this.elements.container.style.cssText} margin: 0 auto;`);
    this.dispatchNodeView();
  }

  handleRightClick(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.inline) {
      this.elements.container.setAttribute('style', `${this.elements.container.style.cssText} margin: 0 0 0 auto;`);
    } else {
      const style = 'display: inline-block; float: right; padding-left: 8px;';
      this.elements.wrapper.setAttribute('style', style);
      this.elements.container.setAttribute('style', style);
    }
    this.dispatchNodeView();
  }

  handleLightboxClick(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const contentImages = Array.from(this.contentRoot.querySelectorAll('img')).filter(
      (img) => img.getAttribute('data-kankan-controller-icon') !== 'true'
    );
    const embeddedIndex = contentImages.findIndex((img) => img === this.elements.img);
    this.elements.container.dispatchEvent(new CustomEvent('kankan-open-image-lightbox', {
      bubbles: true,
      detail: {
        src: this.elements.img.getAttribute('src') || '',
        embeddedIndex,
      },
    }));
  }

  handleCycleClick(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();

    const contentImages = Array.from(this.contentRoot.querySelectorAll('img')).filter(
      (img) => img.getAttribute('data-kankan-controller-icon') !== 'true'
    );
    const embeddedIndex = contentImages.findIndex((img) => img === this.elements.img);
    this.elements.container.dispatchEvent(new CustomEvent('kankan-cycle-image-variation', {
      bubbles: true,
      detail: {
        src: this.elements.img.getAttribute('src') || '',
        embeddedIndex,
      },
    }));
  }

  createPositionControls() {
    const controller = document.createElement('div');
    controller.setAttribute('style', StyleManager.getPositionControllerStyle(this.inline));

    const leftController = this.createControllerIcon(CONSTANTS.ICONS.LEFT);
    leftController.addEventListener('click', (event) => this.handleLeftClick(event));
    controller.appendChild(leftController);

    if (!this.inline) {
      const centerController = this.createControllerIcon(CONSTANTS.ICONS.CENTER);
      centerController.addEventListener('click', (event) => this.handleCenterClick(event));
      controller.appendChild(centerController);
    }

    const rightController = this.createControllerIcon(CONSTANTS.ICONS.RIGHT);
    rightController.addEventListener('click', (event) => this.handleRightClick(event));
    controller.appendChild(rightController);

    const lightboxController = this.createControllerIcon(CONSTANTS.ICONS.LIGHTBOX);
    lightboxController.addEventListener('click', (event) => this.handleLightboxClick(event));
    controller.appendChild(lightboxController);

    const cycleController = this.createControllerIcon(CONSTANTS.ICONS.CYCLE);
    cycleController.addEventListener('click', (event) => this.handleCycleClick(event));
    controller.appendChild(cycleController);

    this.elements.container.appendChild(controller);
  }
}

class ResizeController {
  private state = {
    isResizing: false,
    startX: 0,
    startWidth: 0,
  };

  constructor(
    private readonly elements: { wrapper: HTMLDivElement; container: HTMLDivElement; img: HTMLImageElement },
    private readonly dispatchNodeView: () => void,
    private readonly resizeLimits: ResizeLimits = {},
  ) {}

  handleMouseMove = (event: MouseEvent, index: number) => {
    if (!this.state.isResizing) return;
    const deltaX = index % 2 === 0 ? -(event.clientX - this.state.startX) : event.clientX - this.state.startX;
    const newWidth = clampWidth(this.state.startWidth + deltaX, this.resizeLimits);
    this.elements.container.style.width = `${newWidth}px`;
    this.elements.img.style.width = `${newWidth}px`;
  };

  handleTouchMove = (event: TouchEvent, index: number) => {
    if (!this.state.isResizing) return;
    const deltaX = index % 2 === 0 ? -(event.touches[0].clientX - this.state.startX) : event.touches[0].clientX - this.state.startX;
    const newWidth = clampWidth(this.state.startWidth + deltaX, this.resizeLimits);
    this.elements.container.style.width = `${newWidth}px`;
    this.elements.img.style.width = `${newWidth}px`;
  };

  finishResize() {
    if (this.state.isResizing) {
      this.state.isResizing = false;
      this.dispatchNodeView();
    }
  }

  createResizeHandle(index: number) {
    const dot = document.createElement('div');
    dot.setAttribute('style', StyleManager.getDotStyle(index));
    dot.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.state.isResizing = true;
      this.state.startX = event.clientX;
      this.state.startWidth = this.elements.container.offsetWidth;
      const onMouseMove = (moveEvent: MouseEvent) => this.handleMouseMove(moveEvent, index);
      const onMouseUp = () => {
        this.finishResize();
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
    dot.addEventListener('touchstart', (event) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      this.state.isResizing = true;
      this.state.startX = event.touches[0].clientX;
      this.state.startWidth = this.elements.container.offsetWidth;
      const onTouchMove = (moveEvent: TouchEvent) => this.handleTouchMove(moveEvent, index);
      const onTouchEnd = () => {
        this.finishResize();
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
      };
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: false });
    return dot;
  }
}

class ImageNodeView {
  private readonly elements = {
    wrapper: document.createElement('div'),
    container: document.createElement('div'),
    img: document.createElement('img'),
  };

  constructor(
    private readonly context: ImageResizeContext,
    private readonly inline: boolean,
    private readonly resizeLimits: ResizeLimits = {},
  ) {}

  clearContainerBorder = () => {
    utils.clearContainerBorder(this.elements.container);
  };

  dispatchNodeView = () => {
    const { view, getPos } = this.context;
    if (typeof getPos === 'function') {
      this.clearContainerBorder();
      const newAttrs = {
        ...this.context.node.attrs,
        width: AttributeParser.extractWidthFromStyle(this.elements.container.style.cssText) ?? this.context.node.attrs.width,
        containerStyle: this.elements.container.style.cssText,
        wrapperStyle: this.elements.wrapper.style.cssText,
      };
      view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, newAttrs));
    }
  };

  removeResizeElements = () => {
    utils.removeResizeElements(this.elements.container);
  };

  setupImageAttributes() {
    AttributeParser.parseImageAttributes(this.context.node.attrs, this.elements.img);
  }

  setupDOMStructure() {
    const { wrapperStyle, containerStyle } = this.context.node.attrs;
    this.elements.wrapper.setAttribute('style', wrapperStyle);
    this.elements.wrapper.appendChild(this.elements.container);
    this.elements.container.setAttribute('style', containerStyle);
    this.elements.container.appendChild(this.elements.img);
  }

  applyResizeLimits() {
    let widthStr = AttributeParser.extractWidthFromStyle(this.elements.container.style.cssText);
    if (widthStr === null) {
      const { maxWidth } = this.resizeLimits;
      if (!maxWidth) return;
      widthStr = maxWidth.toString();
    }
    const width = Number(widthStr);
    if (Number.isNaN(width)) return;
    const clamped = clampWidth(width, this.resizeLimits);
    const clampedPx = `${clamped}px`;
    this.elements.container.style.width = clampedPx;
    this.elements.img.style.width = clampedPx;
    this.elements.img.setAttribute('width', String(clamped));
  }

  createPositionController() {
    const positionController = new PositionController(
      this.elements,
      this.inline,
      this.dispatchNodeView,
      this.context.view.dom as HTMLElement,
    );
    positionController.createPositionControls();
  }

  createResizeHandler() {
    const resizeHandler = new ResizeController(this.elements, this.dispatchNodeView, this.resizeLimits);
    Array.from({ length: 4 }, (_, index) => {
      const dot = resizeHandler.createResizeHandle(index);
      this.elements.container.appendChild(dot);
    });
  }

  setupContainerClick() {
    this.elements.container.addEventListener('click', () => {
      if (utils.isMobile()) {
        (document.querySelector('.ProseMirror-focused') as HTMLElement | null)?.blur();
      }
      this.removeResizeElements();
      this.createPositionController();
      this.elements.container.setAttribute('style', `position: relative; border: 1px dashed ${CONSTANTS.COLORS.BORDER}; ${this.context.node.attrs.containerStyle}`);
      this.applyResizeLimits();
      this.createResizeHandler();
    });
  }

  setupContentClick() {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const isClickInside = this.elements.container.contains(target) || target.getAttribute('data-kankan-controller-icon') === 'true';
      if (!isClickInside) {
        this.clearContainerBorder();
        this.removeResizeElements();
      }
    });
  }

  initialize() {
    this.setupDOMStructure();
    this.setupImageAttributes();
    this.applyResizeLimits();
    const { editable } = this.context.editor.options;
    if (!editable) {
      return { dom: this.elements.container };
    }
    this.setupContainerClick();
    this.setupContentClick();
    return { dom: this.elements.wrapper };
  }
}

export const FamilyImageResize = Image.extend({
  name: 'imageResize',

  addOptions(): any {
    return {
      ...this.parent?.(),
      inline: false,
      minWidth: undefined,
      maxWidth: undefined,
    };
  },

  addAttributes() {
    const inline = this.options.inline;
    return {
      ...this.parent?.(),
      containerStyle: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const containerStyle = element.getAttribute('containerstyle');
          if (containerStyle) {
            return containerStyle;
          }
          const width = element.getAttribute('width');
          return width ? StyleManager.getContainerStyle(inline, `${width}px`) : `${element.style.cssText}`;
        },
      },
      wrapperStyle: {
        default: StyleManager.getWrapperStyle(inline),
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }: any) => {
      const options = this.options as any;
      const context: ImageResizeContext = {
        node,
        editor,
        view: editor.view,
        getPos: typeof getPos === 'function' ? getPos : undefined,
      };
      const resizeLimits = {
        minWidth: options.minWidth,
        maxWidth: options.maxWidth,
      };
      return new ImageNodeView(context, options.inline, resizeLimits).initialize();
    };
  },
});

export default FamilyImageResize;