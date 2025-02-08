import { AfterViewInit, Directive, ElementRef, Input, inject } from '@angular/core';

@Directive({ selector: '[appScrollIntoView]' })
export class ScrollIntoViewDirective implements AfterViewInit {
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  private _enabled = false;

  @Input()
  appScrollIntoViewOnAdd = false;

  @Input() set appScrollIntoView(value: boolean) {
    if (value && this._enabled) {
      this.elementRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  ngAfterViewInit() {
    this._enabled = true;

    if (this.appScrollIntoViewOnAdd) {
      this.elementRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
