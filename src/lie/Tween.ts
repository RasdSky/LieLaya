module lie {

	/**
	 * 缓间步骤
	 */
	interface ITween {
		type: number;		// 缓间类型：0：to，1：set，2：wait，3：call
		startTime: number;	// 开始时间
		endTime: number;	// 结束时间
		param?: any;		// 其他参数：根据类型进行区分
	}

	/**
	 * 缓间算法
	 * 公式：r = F(t)，含义：根据经过时间的比例t[0,1]，获取实际时间的比例r。需保证F(0)=0，F(1)=1
	 */
	export type TEaseFunc = (t: number) => number;
	/**
	 * to的参数类型
	 */
	type TToParam = [TEaseFunc, any, any];	// 缓间算法、目标属性、属性增量

	var sign = 'LTween', cache = '$' + sign;// 缓存标志

	/**
	 * 缓间动画
	 */
	export class Tween {

		private $timer: Timer;
		private $target: Object;
		private $loop: boolean;
		private $once: boolean;
		private $steps: ITween[];		// 缓间步骤，存放执行顺序
		private $cSteps: ITween[];		// 缓间步骤，存放完整的执行顺序
		private $needCopy: boolean;		// 是否需要复制顺序
		private $curTime: number;		// 当前时间
		private $frameCall: Function;	// 帧回调
		private $frameObj: any;			// 回调所属对象

		/**
		 * 初始化基础属性
		 */
		private $init(target: Object, loop?: boolean, once?: boolean, frameCall?: Function, frameObj?: any): void {
			var self = this;
			target[cache] = self;	// 清理标志
			self.$target = target;
			self.$loop = loop;
			self.$once = once;
			self.$frameCall = frameCall;
			self.$frameObj = frameObj;
			// 数据初始化
			self.$curTime = 0;
			self.$needCopy = true;
			self.$steps = [];
			self.$cSteps = [];
			// 启动定时器，默认不运行
			self.$timer = new Timer(self.$update, self, 1, false, true);
		}

		/**
		 * 定时器回调
		 */
		private $update(): void {
			var self = this;
			var steps = self.$steps;
			// 检测复制执行顺序
			if (self.$needCopy) {
				self.$needCopy = false;
				ArrayUtils.insert(self.$cSteps, steps);
			}
			// 执行
			var runTime = self.$timer.runTime, remove = 0;
			for (let i = 0, len = steps.length; i < len; i++) {
				let step = steps[i];
				if (step.startTime > runTime)
					break;
				self.$runStep(step);
				// 运行结束
				if (step.endTime <= runTime)
					remove++;
			}
			// 移除执行完毕
			remove > 0 && steps.splice(0, remove);
			// 执行帧回调
			var call = self.$frameCall;
			call && call.call(self.$frameObj);
			// 执行结束：注意需要用self.$steps来判断，因为$runStep可能将Tween给变质了，导致steps不等于self.$step
			steps = self.$steps;
			if (steps && steps.length == 0) {
				if (self.$loop) {
					self.$timer.reset();
					self.$steps = self.$cSteps.concat();
				}
				else {
					self.$once ? self.clear() : self.$pause();
				}
			}
		}


		/**
		 * 静止，时间归0
		 */
		private $pause(): void {
			var self = this;
			var timer = self.$timer;
			self.$needCopy = true;
			self.$curTime = 0;
			self.$steps = [];
			timer.stop();
			timer.reset();
		}

		/**
		 * 添加步骤
		 * @param type 类型
		 * @param duration 持续时间
		 */
		private $addStep(type: number, duration: number, param?: any): void {
			var self = this;
			var startTime = self.$curTime;
			var endTime = self.$curTime = startTime + duration;
			self.$steps.push({ type, startTime, endTime, param });
			self.$timer.start();	// 自动启动
		}

		/**
		 * 获取属性增量，若起始属性没有结束属性的值，则忽略该属性
		 * @param start 起始属性
		 * @param end 结束属性
		 */
		private $getIncrement(start: any, end: any): any {
			var copy = {};
			var keys = Object.keys(end);
			var hasv = Utils.hasValue;
			for (let i in keys) {
				let key = keys[i];
				let value = start[key];
				if (hasv(value))
					copy[key] = end[key] - value;
			}
			return copy;
		}

		/**
		 * 运行步骤
		 */
		private $runStep(step: ITween): void {
			var self = this;
			var type = step.type;
			switch (type) {
				case 0:
					self.$to(step);
					break;
				case 1:
					self.$set(step.param);
					break;
				case 2:
					break;
				case 3:
					self.$call(step.param);
					break;
			}
		}

		/**
		 * 属性渐变
		 */
		private $to(step: ITween): void {
			var self = this;
			// 实际经过时间比例
			var start = step.startTime;
			var ratio = Math.min((self.$timer.runTime - start) / (step.endTime - start), 1);
			// 修改比例
			var param = <TToParam>step.param;
			var ease = param[0];
			ease && (ratio = ease(ratio));
			// 初始化属性
			var target = self.$target, endp = param[1], dstp = param[2] || (
				param[2] = self.$getIncrement(target, endp));
			// 修改属性
			for (let i in dstp) {
				target[i] = endp[i] - dstp[i] * (1 - ratio);
			}
		}

		/**
		 * 复制属性
		 */
		private $set(props: any): void {
			var self = this;
			var target = self.$target;
			for (let i in props)
				target[i] = props[i];
		}

		/**
		 * 执行回调
		 */
		private $call(param: [Function, any]): void {
			param[0].call(param[1]);
		}

		//// 供使用方法 ////

		/**
		 * 执行到对应的属性
		 * @param props 对象属性集合，一般都是属性值都是数字
		 * @param duration 持续时间，非负数，建议时间不低于一帧
		 * @param ease 缓动算法
		 */
		public to(props: any, duration?: number, ease?: TEaseFunc): Tween {
			var self = this;
			if (isNaN(duration) || duration <= 0) {
				self.set(props);
			}
			else {
				self.$addStep(0, duration, [ease, props]);
			}
			return self;
		}

		/**
		 * 直接修改对象属性
		 * @param props 对象属性集合
		 */
		public set(props: any): Tween {
			var self = this;
			self.$addStep(1, 0, props);
			return self;
		}

		/**
		 * 等待
		 * @param delay 毫秒数，大于0才有效
		 */
		public wait(delay: number): Tween {
			var self = this;
			delay > 0 && self.$addStep(2, delay);
			return self;
		}

		/**
		 * 执行回调
		 * 注：尽量避免在回调里对tween进行有持续性的操作to/wait等，会出现异常现象
		 */
		public call(call: Function, thisObj?: any): Tween {
			var self = this;
			call && self.$addStep(3, 0, [call, thisObj]);
			return self;
		}

		//// 特殊方法，不进行拼接，一般用于循环动画或者长时间的动画调用 ////

		/**
		 * 停止运行，不销毁
		 */
		public stop(): void {
			var timer = this.$timer;
			timer && timer.stop();
		}

		/**
		 * 恢复运行
		 */
		public resume(): void {
			var timer = this.$timer;
			timer && timer.start();
		}

		/**
		 * 清理
		 */
		public clear(): void {
			var self = this;
			if (self.$timer) {
				self.$target[cache] = null;	// 清理标志
				self.$timer.clear();
				self.$timer = self.$steps = self.$cSteps = self.$target = self.$frameCall = self.$frameObj = null;
				Laya.Pool.recover(sign, self);
			}
		}

		/**
		 * 获取一个缓间动画对象
		 * 销毁条件：once为true且非循环调用时运行结束会自动销毁，否之请自行调用clear（两个任选一个都行）来清理
		 * @param target 对象
		 * @param props 动画属性：
		 * 1.loop：是否循环执行，默认false；
		 * 2.once：是否自动销毁，默认true，loop为true时该属性无效；
		 * 3.frameCall：帧回调，属性变化后调用
		 * 4.frameObj：帧回调所属对象
		 */
		public static get(target: Object, props?: { loop?: boolean, once?: boolean, frameCall?: Function, frameObj?: any }): Tween {
			var tween = Laya.Pool.getItemByClass(sign, Tween);
			!props && (props = {});
			props.once == void 0 && (props.once = true);
			Tween.clear(target);	// 清除旧动画
			tween.$init(target, props.loop, props.once, props.frameCall, props.frameObj);
			return tween;
		}

		/**
		 * 移除对象的动画
		 * @param target 对象
		 */
		public static clear(target: Object): void {
			var tween = target && target[cache];
			tween instanceof Tween && tween.clear();
		}
	}

	export class Ease {

		/**
		 * 时间的幂次方变化
		 * @param pow 幂次方
		 */
		public static getPowIn(pow: number): TEaseFunc {
			return function (t) {
				return Math.pow(t, pow);
			};
		}

		/**
		 * 反幂次方变化
		 * @param pow 幂次方
		 */
		public static getPowOut(pow: number): TEaseFunc {
			return function (t) {
				return 1 - Math.pow(1 - t, pow);
			};
		};

		/**
		 * 反弹簧变化
		 * @param amplitude 振幅范围
		 * @param period 恢复时间
		 */
		public static getElasticOut(amplitude, period): TEaseFunc {
			var pi2 = Math.PI * 2;
			return function (t) {
				if (t == 0 || t == 1)
					return t;
				var s = period / pi2 * Math.asin(1 / amplitude);
				return (amplitude * Math.pow(2, -10 * t) * Math.sin((t - s) * pi2 / period) + 1);
			};
		};

		/**
		 * 幂次方正反变化
		 */
		public static getPowInOut = function (pow) {
			return function (t) {
				if ((t *= 2) < 1)
					return 0.5 * Math.pow(t, pow);
				return 1 - 0.5 * Math.abs(Math.pow(2 - t, pow));
			};
		};

		/**
		 * 2次平方变化
		 */
		public static quadIn = Ease.getPowIn(2);

		/**
		 * 反2次平方变化
		 */
		public static quadOut = Ease.getPowOut(2);

		/**
		 * 反弹簧
		 */
		public static elasticOut = Ease.getElasticOut(1, 0.3);

		/**
		 * 2次方正反变化
		 */
		public static quadInOut = Ease.getPowInOut(2);
	}
}