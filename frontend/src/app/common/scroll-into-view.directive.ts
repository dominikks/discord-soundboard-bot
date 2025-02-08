import { AfterViewInit, Directive, ElementRef, Input } from '@angular/core';

@Directive({ selector: '[appScrollIntoView]' })
export class ScrollIntoViewDirective implements AfterViewInit {
  private _enabled = false;

  @Input()
  appScrollIntoViewOnAdd = false;

  @Input() set appScrollIntoView(value: boolean) {
    if (value && this._enabled) {
      this.elementRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  ngAfterViewInit() {
    this._enabled = true;

    if (this.appScrollIntoViewOnAdd) {
      this.elementRef.nativeElement.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
