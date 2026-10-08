function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const values = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(values[row][column]) > Math.abs(values[pivot][column])) pivot = row;
    }
    if (Math.abs(values[pivot][column]) < 1e-12) continue;
    [values[column], values[pivot]] = [values[pivot], values[column]];
    const divisor = values[column][column];
    for (let j = column; j <= size; j += 1) values[column][j] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = values[row][column];
      if (factor === 0) continue;
      for (let j = column; j <= size; j += 1) values[row][j] -= factor * values[column][j];
    }
  }
  return values.map(row => row[size]);
}

export function fitRidge(rows, featureNames, targetName, lambda = 1.0) {
  if (!rows.length) throw new Error('Cannot fit a model without training rows.');
  const means = {};
  const scales = {};
  for (const name of featureNames) {
    const values = rows.map(row => Number.isFinite(row.features[name]) ? row.features[name] : 0);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    means[name] = mean;
    scales[name] = Math.sqrt(variance) || 1;
  }

  const width = featureNames.length + 1;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0));
  const vector = Array(width).fill(0);
  for (const row of rows) {
    const x = [1, ...featureNames.map(name => {
      const value = Number.isFinite(row.features[name]) ? row.features[name] : 0;
      return (value - means[name]) / scales[name];
    })];
    const target = row[targetName];
    for (let i = 0; i < width; i += 1) {
      vector[i] += x[i] * target;
      for (let j = 0; j < width; j += 1) matrix[i][j] += x[i] * x[j];
    }
  }
  for (let i = 1; i < width; i += 1) matrix[i][i] += lambda;
  const standardized = solveLinearSystem(matrix, vector);
  const coefficients = {};
  let intercept = standardized[0];
  for (let index = 0; index < featureNames.length; index += 1) {
    const name = featureNames[index];
    coefficients[name] = standardized[index + 1] / scales[name];
    intercept -= coefficients[name] * means[name];
  }
  return { featureNames: [...featureNames], intercept, coefficients, means, scales, lambda, trainingRows: rows.length };
}

export function predictRidge(model, features) {
  let prediction = model.intercept;
  for (const name of model.featureNames) {
    const value = Number.isFinite(features[name]) ? features[name] : 0;
    prediction += model.coefficients[name] * value;
  }
  return prediction;
}
