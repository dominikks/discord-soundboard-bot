import {
  Directive,
  Input,
  isSignal,
  OnChanges,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  ViewContainerRef,
  WritableSignal,
} from '@angular/core';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { Observable, Subject, Subscription } from 'rxjs';
import { DataLoadErrorComponent } from './data-load-error.component';

interface DataLoadContext<T> {
  $implicit: T;
  appDataLoad: T;
}

/**
 * We borrow some code from the ngIf directive to enable type checking in the template:
 * https://angular.io/guide/structural-directives#improving-template-type-checking-for-custom-directives
 * https://github.com/angular/angular/blob/e40a640dfe54b03bfe917d08098c319b0b200d25/packages/common/src/directives/ng_if.ts#L230
 */
@Directive({ selector: '[appDataLoad]' })
export class DataLoadDirective<T> implements OnChanges {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static ngTemplateGuard_appDataLoad: 'binding';

  static ngTemplateContextGuard<T>(
    _dir: DataLoadDirective<T>,
    ctx: unknown
  ): ctx is DataLoadContext<Exclude<T, false | 0 | '' | null | undefined>> {
    return true;
  }

  @Input({ required: true }) appDataLoad: Observable<T>;
  @Input() appDataLoadCallback?: WritableSignal<T> | Subject<T>;

  private state: 'loading' | 'error' | 'done';
  private data: T;
  private activeSubscription: Subscription;

  constructor(private templateRef: TemplateRef<DataLoadContext<T>>, private viewContainer: ViewContainerRef, private renderer: Renderer2) {}

  ngOnChanges(changes: SimpleChanges) {
    if ('appDataLoad' in changes) {
      this.resubscribe();
    }
  }

  private resubscribe() {
    this.activeSubscription?.unsubscribe();
    this.state = 'loading';
    this.update();

    this.activeSubscription = this.appDataLoad.subscribe({
      next: data => {
        this.state = 'done';
        this.data = data;

        if (isSignal(this.appDataLoadCallback)) {
          this.appDataLoadCallback.set(data);
        } else if (this.appDataLoadCallback instanceof Subject) {
          this.appDataLoadCallback.next(data);
        }

        this.update();
      },
      error: () => {
        this.state = 'error';
        this.update();
      },
    });
  }

  private update() {
    this.viewContainer.clear();

    switch (this.state) {
      case 'done':
        const view = this.viewContainer.createEmbeddedView(this.templateRef, {
          $implicit: this.data,
          appDataLoad: this.data,
        } satisfies DataLoadContext<T>);
        view.detectChanges();
        break;
      case 'loading': {
        const loadingSpinner = this.viewContainer.createComponent(MatProgressSpinner);
        loadingSpinner.instance.mode = 'indeterminate';
        this.renderer.setStyle(loadingSpinner.location.nativeElement, 'margin', '16px auto');
        loadingSpinner.changeDetectorRef.detectChanges();
        break;
      }
      case 'error': {
        const componentRef = this.viewContainer.createComponent(DataLoadErrorComponent);
        const retrySubscription = componentRef.instance.retry.subscribe(() => this.resubscribe());
        componentRef.onDestroy(() => retrySubscription.unsubscribe());
        componentRef.changeDetectorRef.detectChanges();
        break;
      }
    }
  }
}
