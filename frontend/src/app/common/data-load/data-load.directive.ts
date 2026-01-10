import {
  Directive,
  inject,
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

type DataLoadState<T> =
  | { type: 'idle' }
  | { type: 'loading'; subscription: Subscription }
  | { type: 'error' }
  | { type: 'done'; data: T };

/**
 * We borrow some code from the ngIf directive to enable type checking in the template:
 * https://angular.io/guide/structural-directives#improving-template-type-checking-for-custom-directives
 * https://github.com/angular/angular/blob/e40a640dfe54b03bfe917d08098c319b0b200d25/packages/common/src/directives/ng_if.ts#L230
 */
@Directive({ selector: '[appDataLoad]' })
export class DataLoadDirective<T> implements OnChanges {
  static ngTemplateGuard_appDataLoad: 'binding';

  static ngTemplateContextGuard<T>(
    _dir: DataLoadDirective<T>,
    ctx: unknown,
  ): ctx is DataLoadContext<Exclude<T, false | 0 | '' | null | undefined>> {
    return true;
  }

  private templateRef = inject<TemplateRef<DataLoadContext<T>>>(TemplateRef);
  private viewContainer = inject(ViewContainerRef);
  private renderer = inject(Renderer2);

  @Input({ required: true }) appDataLoad!: Observable<T>;
  @Input() appDataLoadCallback?: WritableSignal<T> | Subject<T>;

  private state: DataLoadState<T> = { type: 'idle' };

  ngOnChanges(changes: SimpleChanges) {
    if ('appDataLoad' in changes) {
      this.resubscribe();
    }
  }

  private resubscribe() {
    // Clean up any existing subscription
    if (this.state.type === 'loading') {
      this.state.subscription.unsubscribe();
    }

    // Set up new subscription
    const subscription = this.appDataLoad.subscribe({
      next: data => {
        this.state = { type: 'done', data };

        if (isSignal(this.appDataLoadCallback)) {
          this.appDataLoadCallback.set(data);
        } else if (this.appDataLoadCallback instanceof Subject) {
          this.appDataLoadCallback.next(data);
        }

        this.update();
      },
      error: () => {
        // Clean up subscription
        if (this.state.type === 'loading') {
          this.state.subscription.unsubscribe();
        }
        this.state = { type: 'error' };
        this.update();
      },
    });

    this.state = { type: 'loading', subscription };
    this.update();
  }

  private update() {
    this.viewContainer.clear();

    switch (this.state.type) {
      case 'done':
        const view = this.viewContainer.createEmbeddedView(this.templateRef, {
          $implicit: this.state.data,
          appDataLoad: this.state.data,
        } satisfies DataLoadContext<T>);
        view.detectChanges();
        break;
      case 'idle':
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
