import type { Component } from "solid-js";

export interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface FeatureCardProps {
  feature: Feature;
}

const FeatureCard: Component<FeatureCardProps> = (props) => {
  return (
    <div class="glass rounded-2xl p-6 hover:border-cognito-500/30 transition group">
      <div class="w-12 h-12 bg-cognito-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cognito-500/20 transition">
        <i class={`${props.feature.icon} text-cognito-400 text-xl`}></i>
      </div>
      <h3 class="text-lg font-semibold text-white mb-2">
        {props.feature.title}
      </h3>
      <p class="text-gray-400 text-sm leading-relaxed">
        {props.feature.description}
      </p>
    </div>
  );
};

export default FeatureCard;
