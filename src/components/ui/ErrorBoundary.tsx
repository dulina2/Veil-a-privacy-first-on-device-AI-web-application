import React from 'react';
import { Button } from '@/src/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/src/components/ui/card';

interface ErrorBoundaryProps {
  moduleName: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ModuleErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="p-6 max-w-xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>{this.props.moduleName} encountered an error</CardTitle>
              <CardDescription>
                Your encrypted data in IndexedDB remains safe. No data left this device.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-mono-tabular bg-[var(--bg-subtle)] p-3 rounded-lg border border-[var(--border-hairline)]">
                {this.state.errorMessage}
              </p>
              <Button
                onClick={() => this.setState({ hasError: false, errorMessage: '' })}
                variant="default"
              >
                Recover {this.props.moduleName}
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
