import {
  define,
  observable,
  batch,
  toJS,
  isObservable,
  observe,
} from '@formily/reactive'
import {
  FormPath,
  FormPathPattern,
  isFn,
  isValid,
  uid,
  globalThisPolyfill,
  defaults,
  clone,
} from '@formily/shared'
import { Heart } from './Heart'
import { Field } from './Field'
import {
  JSXComponent,
  LifeCycleTypes,
  HeartSubscriber,
  FormPatternTypes,
  IFormRequests,
  IFormFeedback,
  ISearchFeedback,
  IFormGraph,
  IFormProps,
  IFieldResetOptions,
  IFormFields,
  IFieldFactoryProps,
  IVoidFieldFactoryProps,
  IFormState,
  IModelGetter,
  IModelSetter,
  IFieldStateGetter,
  IFieldStateSetter,
  FormDisplayTypes,
} from '../types'
import {
  isVoidField,
  runEffects,
  modelStateGetter,
  modelStateSetter,
  createFieldStateSetter,
  createFieldStateGetter,
  applyValuesPatch,
} from '../shared'
import { ArrayField } from './ArrayField'
import { ObjectField } from './ObjectField'
import { VoidField } from './VoidField'
import { Query } from './Query'
import { Graph } from './Graph'

const DEV_TOOLS_HOOK = '__FORMILY_DEV_TOOLS_HOOK__'

export class Form<ValueType extends object = any> {
  displayName = 'Form'
  id: string
  initialized: boolean
  validating: boolean
  submitting: boolean
  modified: boolean
  pattern: FormPatternTypes
  display: FormDisplayTypes
  values: ValueType
  initialValues: ValueType
  mounted: boolean
  unmounted: boolean
  props: IFormProps
  heart: Heart
  graph: Graph
  fields: IFormFields = {}
  requests: IFormRequests = {}
  indexes: Map<string, string> = new Map()
  disposers: (() => void)[] = []

  constructor(props: IFormProps) {
    this.initialize(props)
    this.makeInitialValues()
    this.makeObservable()
    this.makeReactive()
    this.onInit()
  }

  protected initialize(props: IFormProps) {
    this.id = uid()
    this.props = { ...props }
    this.initialized = false
    this.submitting = false
    this.validating = false
    this.modified = false
    this.mounted = false
    this.unmounted = false
    this.display = this.props.display || 'visible'
    this.pattern = this.props.pattern || 'editable'
    this.editable = this.props.editable
    this.disabled = this.props.disabled
    this.readOnly = this.props.readOnly
    this.readPretty = this.props.readPretty
    this.visible = this.props.visible
    this.hidden = this.props.hidden
    this.graph = new Graph(this)
    this.heart = new Heart({
      lifecycles: this.lifecycles,
      context: this,
    })
  }

  protected makeInitialValues() {
    this.values = isObservable(this.props.values)
      ? this.props.values
      : clone(this.props.values) || ({} as any)
    this.initialValues = isObservable(this.props.initialValues)
      ? this.props.initialValues
      : clone(this.props.initialValues) || ({} as any)
    applyValuesPatch(this, [], this.initialValues)
  }

  protected makeObservable() {
    define(this, {
      fields: observable.shallow,
      initialized: observable.ref,
      validating: observable.ref,
      submitting: observable.ref,
      modified: observable.ref,
      pattern: observable.ref,
      display: observable.ref,
      mounted: observable.ref,
      unmounted: observable.ref,
      values: observable,
      initialValues: observable,
      valid: observable.computed,
      invalid: observable.computed,
      errors: observable.computed,
      warnings: observable.computed,
      successes: observable.computed,
      hidden: observable.computed,
      visible: observable.computed,
      editable: observable.computed,
      readOnly: observable.computed,
      readPretty: observable.computed,
      disabled: observable.computed,
      setValues: batch,
      setValuesIn: batch,
      setInitialValues: batch,
      setInitialValuesIn: batch,
      setPattern: batch,
      setDisplay: batch,
      setState: batch,
      deleteIntialValuesIn: batch,
      deleteValuesIn: batch,
      setSubmitting: batch,
      setValidating: batch,
      setFormGraph: batch,
      clearFormGraph: batch,
      onMount: batch,
      onUnmount: batch,
      onInit: batch,
    })
  }

  protected makeReactive() {
    this.disposers.push(
      observe(this.initialValues, (change) => {
        if (change.type === 'add' || change.type === 'set') {
          applyValuesPatch(this, change.path.slice(1), change.value)
        }
        this.notify(LifeCycleTypes.ON_FORM_INITIAL_VALUES_CHANGE)
      }),
      observe(this.values, () => {
        this.notify(LifeCycleTypes.ON_FORM_VALUES_CHANGE)
      })
    )
  }

  get valid() {
    return !this.invalid
  }

  get invalid() {
    return this.errors.length > 0
  }

  get errors() {
    return this.queryFeedbacks({
      type: 'error',
    })
  }

  get warnings() {
    return this.queryFeedbacks({
      type: 'warning',
    })
  }

  get successes() {
    return this.queryFeedbacks({
      type: 'success',
    })
  }

  get lifecycles() {
    return runEffects(this, this.props.effects)
  }

  get hidden() {
    return this.display === 'hidden'
  }

  get visible() {
    return this.display === 'visible'
  }

  set hidden(hidden: boolean) {
    if (!isValid(hidden)) return
    if (hidden) {
      this.display = 'hidden'
    } else {
      this.display = 'visible'
    }
  }

  set visible(visible: boolean) {
    if (!isValid(visible)) return
    if (visible) {
      this.display = 'visible'
    } else {
      this.display = 'none'
    }
  }

  get editable() {
    return this.pattern === 'editable'
  }

  set editable(editable) {
    if (!isValid(editable)) return
    if (editable) {
      this.pattern = 'editable'
    } else {
      this.pattern = 'readPretty'
    }
  }

  get readOnly() {
    return this.pattern === 'readOnly'
  }

  set readOnly(readOnly) {
    if (!isValid(readOnly)) return
    if (readOnly) {
      this.pattern = 'readOnly'
    } else {
      this.pattern = 'editable'
    }
  }

  get disabled() {
    return this.pattern === 'disabled'
  }

  set disabled(disabled) {
    if (!isValid(disabled)) return
    if (disabled) {
      this.pattern = 'disabled'
    } else {
      this.pattern = 'editable'
    }
  }

  get readPretty() {
    return this.pattern === 'readPretty'
  }

  set readPretty(readPretty) {
    if (!isValid(readPretty)) return
    if (readPretty) {
      this.pattern = 'readPretty'
    } else {
      this.pattern = 'editable'
    }
  }

  /** 创建字段 **/

  createField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ) => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier]) {
      batch(() => {
        this.fields[identifier] = new Field(address, props, this)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as Field<Decorator, Component>
  }

  createArrayField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ) => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier]) {
      batch(() => {
        this.fields[identifier] = new ArrayField(address, props, this)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as ArrayField<Decorator, Component>
  }

  createObjectField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IFieldFactoryProps<Decorator, Component>
  ) => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier]) {
      batch(() => {
        this.fields[identifier] = new ObjectField(address, props, this)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as ObjectField<Decorator, Component>
  }

  createVoidField = <
    Decorator extends JSXComponent,
    Component extends JSXComponent
  >(
    props: IVoidFieldFactoryProps<Decorator, Component>
  ) => {
    const address = FormPath.parse(props.basePath).concat(props.name)
    const identifier = address.toString()
    if (!identifier) return
    if (!this.fields[identifier]) {
      batch(() => {
        this.fields[identifier] = new VoidField(address, props, this)
      })
      this.notify(LifeCycleTypes.ON_FORM_GRAPH_CHANGE)
    }
    return this.fields[identifier] as VoidField<Decorator, Component>
  }

  /** 状态操作模型 **/

  setValues = (values: any, strategy: 'overwrite' | 'merge' = 'merge') => {
    if (strategy === 'merge') {
      this.values = defaults(this.values, values)
    } else {
      this.values = values
    }
  }

  setInitialValues = (
    initialValues: any,
    strategy: 'overwrite' | 'merge' = 'merge'
  ) => {
    if (strategy === 'merge') {
      this.initialValues = defaults(this.initialValues, initialValues)
    } else {
      this.initialValues = initialValues
    }
  }

  setValuesIn = (pattern: FormPathPattern, value: any) => {
    FormPath.setIn(this.values, pattern, value)
  }

  deleteValuesIn = (pattern: FormPathPattern) => {
    FormPath.deleteIn(this.values, pattern)
  }

  existValuesIn = (pattern: FormPathPattern) => {
    return FormPath.existIn(this.values, pattern)
  }

  getValuesIn = (pattern: FormPathPattern) => {
    return FormPath.getIn(this.values, pattern)
  }

  setInitialValuesIn = (pattern: FormPathPattern, initialValue: any) => {
    FormPath.setIn(this.initialValues, pattern, initialValue)
  }

  deleteIntialValuesIn = (pattern: FormPathPattern) => {
    FormPath.deleteIn(this.initialValues, pattern)
  }

  existInitialValuesIn = (pattern: FormPathPattern) => {
    return FormPath.existIn(this.initialValues, pattern)
  }

  getInitialValuesIn = (pattern: FormPathPattern) => {
    return FormPath.getIn(this.initialValues, pattern)
  }

  setSubmitting = (submitting: boolean) => {
    clearTimeout(this.requests.submit)
    if (submitting) {
      this.requests.submit = setTimeout(() => {
        batch(() => {
          this.submitting = submitting
        })
      }, 100)
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_START)
    } else {
      if (this.submitting !== submitting) {
        this.submitting = submitting
      }
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_END)
    }
  }

  setValidating = (validating: boolean) => {
    clearTimeout(this.requests.validate)
    if (validating) {
      this.requests.validate = setTimeout(() => {
        batch(() => {
          this.validating = validating
        })
      }, 100)
      this.notify(LifeCycleTypes.ON_FORM_VALIDATE_START)
    } else {
      if (this.validating !== validating) {
        this.validating = validating
      }
      this.notify(LifeCycleTypes.ON_FORM_VALIDATE_END)
    }
  }

  setDisplay = (display: FormDisplayTypes) => {
    this.display = display
  }

  setPattern = (pattern: FormPatternTypes) => {
    this.pattern = pattern
  }

  addEffects = (id: string, effects: IFormProps['effects']) => {
    this.heart.addLifeCycles(id, runEffects(this, effects))
  }

  removeEffects = (id: string) => {
    this.heart.removeLifeCycles(id)
  }

  setEffects = (effects: IFormProps['effects']) => {
    this.heart.setLifeCycles(runEffects(this, effects))
  }

  clearErrors = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'error',
          messages: [],
        })
      }
    })
  }

  clearWarnings = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'warning',
          messages: [],
        })
      }
    })
  }

  clearSuccesses = (pattern: FormPathPattern = '*') => {
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        field.setFeedback({
          type: 'success',
          messages: [],
        })
      }
    })
  }

  query = (pattern: FormPathPattern): Query => {
    return new Query({
      pattern,
      base: '',
      form: this,
    })
  }

  queryFeedbacks = (search: ISearchFeedback): IFormFeedback[] => {
    return this.query(search.address || search.path || '*').reduce(
      (messages, field) => {
        if (isVoidField(field)) return messages
        return messages.concat(
          field
            .queryFeedbacks(search)
            .map((feedback) => ({
              ...feedback,
              address: field.address.toString(),
              path: field.path.toString(),
            }))
            .filter((feedback) => feedback.messages.length > 0)
        )
      },
      []
    )
  }

  notify = (type: string, payload?: any) => {
    this.heart.publish(type, isValid(payload) ? payload : this)
  }

  subscribe = (subscriber?: HeartSubscriber) => {
    return this.heart.subscribe(subscriber)
  }

  unsubscribe = (id: number) => {
    this.heart.unsubscribe(id)
  }

  /**事件钩子**/

  onInit = () => {
    this.initialized = true
    this.notify(LifeCycleTypes.ON_FORM_INIT)
  }

  onMount = () => {
    this.mounted = true
    this.notify(LifeCycleTypes.ON_FORM_MOUNT)
    if (globalThisPolyfill[DEV_TOOLS_HOOK]) {
      globalThisPolyfill[DEV_TOOLS_HOOK].inject(this.id, this)
    }
  }

  onUnmount = () => {
    this.query('*').forEach((field) => field.dispose())
    this.unmounted = true
    this.fields = {}
    this.indexes.clear()
    this.notify(LifeCycleTypes.ON_FORM_UNMOUNT)
    if (globalThisPolyfill[DEV_TOOLS_HOOK]) {
      globalThisPolyfill[DEV_TOOLS_HOOK].unmount(this.id)
    }
  }

  setState: IModelSetter<IFormState> = modelStateSetter(this)

  getState: IModelGetter<IFormState> = modelStateGetter(this)

  setFormState: IModelSetter<IFormState> = modelStateSetter(this)

  getFormState: IModelGetter<IFormState> = modelStateGetter(this)

  setFieldState: IFieldStateSetter = createFieldStateSetter(this)

  getFieldState: IFieldStateGetter = createFieldStateGetter(this)

  getFormGraph = () => {
    return this.graph.getGraph()
  }

  setFormGraph = (graph: IFormGraph) => {
    this.graph.setGraph(graph)
  }

  clearFormGraph = () => {
    this.fields = {}
  }

  validate = async (pattern: FormPathPattern = '*') => {
    this.setValidating(true)
    const tasks = []
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        tasks.push(field.validate())
      }
    })
    await Promise.all(tasks)
    this.setValidating(false)
    if (this.invalid) {
      this.notify(LifeCycleTypes.ON_FORM_VALIDATE_FAILED)
      throw this.errors
    }
    this.notify(LifeCycleTypes.ON_FORM_VALIDATE_SUCCESS)
  }

  submit = async <T>(
    onSubmit?: (values: any) => Promise<T> | void
  ): Promise<T> => {
    this.setSubmitting(true)
    try {
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_VALIDATE_START)
      await this.validate()
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_VALIDATE_SUCCESS)
    } catch (e) {
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_VALIDATE_FAILED)
    }
    this.notify(LifeCycleTypes.ON_FORM_SUBMIT_VALIDATE_END)
    let results: any
    try {
      if (isFn(onSubmit) && this.valid) {
        results = await onSubmit(toJS(this.values))
      } else if (this.invalid) {
        throw this.errors
      }
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_SUCCESS)
    } catch (e) {
      this.setSubmitting(false)
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT_FAILED)
      this.notify(LifeCycleTypes.ON_FORM_SUBMIT)
      throw e
    }
    this.setSubmitting(false)
    this.notify(LifeCycleTypes.ON_FORM_SUBMIT)
    return results
  }

  reset = async (
    pattern: FormPathPattern = '*',
    options?: IFieldResetOptions
  ) => {
    const tasks = []
    this.query(pattern).forEach((field) => {
      if (!isVoidField(field)) {
        tasks.push(field.reset(options))
      }
    })
    this.notify(LifeCycleTypes.ON_FORM_RESET)
    await Promise.all(tasks)
  }
}
